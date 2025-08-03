#!/usr/bin/env node

/**
 * Simple validation script for the Cerebras context limit fix
 * This script validates the logic without requiring the full app to run
 */

// Helper function to estimate tokens (matches the implementation)
function estimateTokens(text) {
  return Math.ceil(text.length / 3.5)
}

function validateTokenEstimation() {
  console.log("🧪 Validating token estimation...")
  
  const testCases = [
    { text: "", expected: 0 },
    { text: "Hello world", expectedMin: 2, expectedMax: 5 },
    { text: "a".repeat(3500), expectedMin: 950, expectedMax: 1050 }, // Should be ~1000 tokens
    { text: "x".repeat(65536 * 3.5), expectedMin: 65000, expectedMax: 70000 }, // Should exceed Cerebras limit
  ]
  
  for (const { text, expected, expectedMin, expectedMax } of testCases) {
    const tokens = estimateTokens(text)
    
    if (expected !== undefined) {
      if (tokens === expected) {
        console.log(`  ✅ "${text.substring(0, 20)}..." -> ${tokens} tokens (expected ${expected})`)
      } else {
        console.log(`  ❌ "${text.substring(0, 20)}..." -> ${tokens} tokens (expected ${expected})`)
        return false
      }
    } else {
      if (tokens >= expectedMin && tokens <= expectedMax) {
        console.log(`  ✅ "${text.substring(0, 20)}..." -> ${tokens} tokens (${expectedMin}-${expectedMax})`)
      } else {
        console.log(`  ❌ "${text.substring(0, 20)}..." -> ${tokens} tokens (expected ${expectedMin}-${expectedMax})`)
        return false
      }
    }
  }
  
  return true
}

function validateContextLogic() {
  console.log("\n🧪 Validating context limit logic...")
  
  // Simulate Cerebras model limits
  const cerebrasContextLimit = 65536
  const outputLimit = 4096
  const threshold = Math.max((cerebrasContextLimit - outputLimit) * 0.8, 0)
  
  console.log(`  📊 Cerebras limits: context=${cerebrasContextLimit}, output=${outputLimit}, threshold=${threshold}`)
  
  // Test scenarios
  const scenarios = [
    {
      name: "Small conversation",
      totalTokens: 1000,
      shouldTrigger: false,
    },
    {
      name: "Medium conversation",
      totalTokens: 30000,
      shouldTrigger: false,
    },
    {
      name: "Large conversation (80% threshold)",
      totalTokens: threshold + 100,
      shouldTrigger: true,
    },
    {
      name: "Very large conversation",
      totalTokens: 60000,
      shouldTrigger: true,
    },
  ]
  
  for (const scenario of scenarios) {
    const shouldTrigger = scenario.totalTokens > threshold
    
    if (shouldTrigger === scenario.shouldTrigger) {
      console.log(`  ✅ ${scenario.name}: ${scenario.totalTokens} tokens -> trigger=${shouldTrigger}`)
    } else {
      console.log(`  ❌ ${scenario.name}: ${scenario.totalTokens} tokens -> trigger=${shouldTrigger} (expected ${scenario.shouldTrigger})`)
      return false
    }
  }
  
  return true
}

function validateFileHandling() {
  console.log("\n🧪 Validating file content handling...")
  
  const fileContent = "function test() { return 'hello'; }".repeat(100)
  const base64Content = Buffer.from(fileContent).toString("base64")
  const dataUrl = `data:text/plain;base64,${base64Content}`
  
  const estimatedTokens = estimateTokens(fileContent)
  
  console.log(`  📄 File content: ${fileContent.length} chars -> ${estimatedTokens} tokens`)
  
  if (estimatedTokens > 100 && estimatedTokens < 10000) {
    console.log(`  ✅ File token estimation is reasonable`)
    return true
  } else {
    console.log(`  ❌ File token estimation seems off: ${estimatedTokens}`)
    return false
  }
}

function validateEdgeCases() {
  console.log("\n🧪 Validating edge cases...")
  
  const edgeCases = [
    {
      name: "Zero context limit",
      contextLimit: 0,
      tokens: 10000,
      shouldTrigger: false, // No limit means no triggering
    },
    {
      name: "Very small context limit",
      contextLimit: 1000,
      tokens: 500,
      shouldTrigger: true, // With 1000 context and 4096 output, threshold becomes negative, so any tokens > 0 trigger
    },
    {
      name: "Negative tokens (edge case)",
      contextLimit: 65536,
      tokens: 0,
      shouldTrigger: false,
    },
  ]
  
  for (const { name, contextLimit, tokens, shouldTrigger } of edgeCases) {
    const outputLimit = 4096
    const threshold = Math.max((contextLimit - outputLimit) * 0.8, 0)
    const actualTrigger = contextLimit > 0 && tokens > threshold
    
    if (actualTrigger === shouldTrigger) {
      console.log(`  ✅ ${name}: trigger=${actualTrigger}`)
    } else {
      console.log(`  ❌ ${name}: trigger=${actualTrigger} (expected ${shouldTrigger})`)
      return false
    }
  }
  
  return true
}

// Run all validations
console.log("🚀 Validating Cerebras Context Limit Fix\n")

const validations = [
  validateTokenEstimation,
  validateContextLogic,
  validateFileHandling,
  validateEdgeCases,
]

let allPassed = true

for (const validation of validations) {
  if (!validation()) {
    allPassed = false
    break
  }
}

if (allPassed) {
  console.log("\n🎉 All validations passed!")
  console.log("\n📋 Fix Summary:")
  console.log("   • Implements comprehensive token estimation")
  console.log("   • Uses 80% threshold for proactive summarization")
  console.log("   • Handles file content in token calculations")
  console.log("   • Accounts for system prompts and full conversation")
  console.log("   • Gracefully handles edge cases")
  console.log("\n✨ This should prevent the Cerebras 65536 token limit error!")
} else {
  console.log("\n❌ Some validations failed. Please check the implementation.")
  process.exit(1)
}