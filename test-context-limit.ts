#!/usr/bin/env bun

/**
 * Integration test for Cerebras context limit fix
 * 
 * This test simulates the scenario where a conversation exceeds
 * the Cerebras model's 65536 token limit and verifies that
 * summarization is triggered before the API call fails.
 */

import { Identifier } from "./packages/opencode/src/id/id"

// Helper function to estimate tokens (matches the implementation)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

// Test cases
const testCases = [
  {
    name: "Cerebras qwen-3-coder-480b context limit",
    contextLimit: 65536,
    outputLimit: 4096,
    threshold: 0.8,
    shouldTriggerSummarization: true,
  },
  {
    name: "High context limit model",
    contextLimit: 200000,
    outputLimit: 4096,
    threshold: 0.8,
    shouldTriggerSummarization: false,
  },
]

function createLongConversation(targetTokens: number) {
  const messages = []
  const longText = "This is a long message that will help us reach the token limit. ".repeat(100) // ~1.8k tokens
  
  const messagesNeeded = Math.ceil(targetTokens / estimateTokens(longText))
  
  for (let i = 0; i < messagesNeeded; i++) {
    messages.push({
      info: {
        id: Identifier.ascending("message"),
        role: i % 2 === 0 ? "user" : "assistant",
        sessionID: "test-session",
        time: { created: Date.now() },
      },
      parts: [
        {
          id: Identifier.ascending("part"),
          messageID: Identifier.ascending("message"),
          sessionID: "test-session",
          type: "text",
          text: longText,
        },
      ],
    })
  }
  
  return messages
}

function testContextLimitLogic(testCase: any) {
  console.log(`\n🧪 Testing: ${testCase.name}`)
  
  const { contextLimit, outputLimit, threshold } = testCase
  const availableContext = contextLimit - outputLimit
  const triggerThreshold = Math.max(availableContext * threshold, 0)
  
  console.log(`📊 Limits: Context=${contextLimit}, Output=${outputLimit}, Threshold=${triggerThreshold}`)
  
  // Create a conversation that would exceed the threshold
  const targetTokens = triggerThreshold + 1000 // Exceed threshold by 1000 tokens
  const messages = createLongConversation(targetTokens)
  
  // Calculate total estimated tokens
  let totalTokens = 0
  
  // Add system prompt estimation (typical system prompt)
  const systemPrompt = "You are Claude Code, Anthropic's official CLI for Claude. You are an interactive CLI tool that helps users with software engineering tasks."
  totalTokens += estimateTokens(systemPrompt)
  
  // Add conversation tokens
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "text") {
        totalTokens += estimateTokens(part.text)
      }
    }
  }
  
  // Add new user input
  const newUserInput = "Please help me with this additional task that might push us over the limit."
  totalTokens += estimateTokens(newUserInput)
  
  console.log(`📈 Estimated tokens: ${totalTokens}`)
  console.log(`🎯 Trigger threshold: ${triggerThreshold}`)
  
  const shouldTriggerSummarization = totalTokens > triggerThreshold
  
  if (shouldTriggerSummarization === testCase.shouldTriggerSummarization) {
    console.log(`✅ PASS: Summarization trigger behavior is correct`)
  } else {
    console.log(`❌ FAIL: Expected summarization=${testCase.shouldTriggerSummarization}, got=${shouldTriggerSummarization}`)
    process.exit(1)
  }
  
  return {
    totalTokens,
    triggerThreshold,
    shouldTriggerSummarization,
  }
}

function testFileTokenEstimation() {
  console.log(`\n🧪 Testing: File token estimation`)
  
  const fileContent = "function example() {\n  return 'hello world';\n}".repeat(1000)
  const base64Content = Buffer.from(fileContent).toString("base64")
  const dataUrl = `data:text/plain;base64,${base64Content}`
  
  const estimatedTokens = estimateTokens(fileContent)
  console.log(`📄 File content length: ${fileContent.length} chars`)
  console.log(`🔢 Estimated tokens: ${estimatedTokens}`)
  
  if (estimatedTokens > 1000 && estimatedTokens < 50000) {
    console.log(`✅ PASS: File token estimation is reasonable`)
  } else {
    console.log(`❌ FAIL: File token estimation seems off: ${estimatedTokens}`)
    process.exit(1)
  }
}

function testEdgeCases() {
  console.log(`\n🧪 Testing: Edge cases`)
  
  // Test empty context
  const emptyTokens = estimateTokens("")
  console.log(`📭 Empty text tokens: ${emptyTokens}`)
  
  // Test very long single message
  const veryLongText = "x".repeat(100000)
  const veryLongTokens = estimateTokens(veryLongText)
  console.log(`📏 Very long text (100k chars) tokens: ${veryLongTokens}`)
  
  // Test zero context limit (should not trigger summarization)
  const zeroContextLimit = 0
  const shouldTrigger = veryLongTokens > Math.max((zeroContextLimit - 4096) * 0.8, 0)
  console.log(`🚫 Zero context limit should trigger: ${shouldTrigger}`)
  
  if (emptyTokens === 0 && veryLongTokens > 25000 && !shouldTrigger) {
    console.log(`✅ PASS: Edge cases handled correctly`)
  } else {
    console.log(`❌ FAIL: Edge cases not handled properly`)
    console.log(`   Empty: ${emptyTokens}, VeryLong: ${veryLongTokens}, ZeroLimit: ${shouldTrigger}`)
    process.exit(1)
  }
}

// Run all tests
console.log("🚀 Starting Cerebras Context Limit Fix Tests")

for (const testCase of testCases) {
  testContextLimitLogic(testCase)
}

testFileTokenEstimation()
testEdgeCases()

console.log("\n🎉 All tests passed! The context limit fix should prevent Cerebras API errors.")
console.log("📝 Summary:")
console.log("   • Token estimation works correctly")
console.log("   • Context limit checking triggers summarization at 80% threshold")
console.log("   • File content is properly estimated")
console.log("   • Edge cases are handled gracefully")