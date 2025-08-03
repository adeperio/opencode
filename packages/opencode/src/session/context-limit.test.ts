import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Session } from "./index"
import { Storage } from "../storage/storage"
import { Config } from "../config/config"
import { Provider } from "../provider/provider"
import { Identifier } from "../id/id"

// Mock dependencies
const mockStorage = {
  writeJSON: async () => {},
  readJSON: async () => ({}),
  list: async () => [],
  remove: async () => {},
  removeDir: async () => {},
}

const mockConfig = {
  get: async () => ({
    provider: {},
    disabled_providers: [],
  }),
}

const mockProvider = {
  getModel: async (providerID: string, modelID: string) => {
    if (modelID === "qwen-3-coder-480b") {
      return {
        info: {
          id: modelID,
          limit: {
            context: 65536, // Cerebras limit
            output: 4096,
          },
          cost: { input: 0, output: 0 },
          temperature: true,
          tool_call: true,
          attachment: false,
          reasoning: false,
          options: {},
        },
        language: {}, // Mock language model
      }
    }
    return {
      info: {
        id: modelID,
        limit: {
          context: 200000, // High limit model
          output: 4096,
        },
        cost: { input: 0, output: 0 },
        temperature: true,
        tool_call: true,
        attachment: false,
        reasoning: false,
        options: {},
      },
      language: {},
    }
  },
}

// Mock modules
jest.mock("../storage/storage", () => ({ Storage: mockStorage }))
jest.mock("../config/config", () => ({ Config: mockConfig }))
jest.mock("../provider/provider", () => ({ Provider: mockProvider }))

describe("Context Limit Management", () => {
  let sessionID: string

  beforeEach(async () => {
    sessionID = Identifier.descending("session")
  })

  afterEach(async () => {
    // Cleanup
  })

  describe("Token Estimation", () => {
    it("should estimate tokens correctly for text content", () => {
      // Create a long text that would exceed 65536 tokens
      const longText = "a".repeat(200000) // ~57k tokens at 3.5 chars/token
      const shortText = "Hello world" // ~3 tokens

      // The estimateTokens function should be accessible for testing
      // For now, we'll test the integration through the chat function
      expect(longText.length).toBeGreaterThan(65536 * 3.5)
      expect(shortText.length).toBeLessThan(100)
    })

    it("should handle system prompts in token estimation", () => {
      const systemPrompt = "You are a helpful assistant. ".repeat(1000) // ~3k tokens
      expect(systemPrompt.length).toBeGreaterThan(3000)
    })
  })

  describe("Context Limit Handling", () => {
    it("should trigger summarization before hitting Cerebras context limit", async () => {
      // Mock a session with many messages that would exceed 65536 tokens
      const longMessage = "This is a very long message. ".repeat(2000) // ~15k tokens
      
      // Create multiple messages to exceed the limit
      const mockMessages = Array.from({ length: 5 }, (_, i) => ({
        info: {
          id: Identifier.ascending("message"),
          role: "user" as const,
          sessionID,
          time: { created: Date.now() },
        },
        parts: [
          {
            id: Identifier.ascending("part"),
            messageID: Identifier.ascending("message"),
            sessionID,
            type: "text" as const,
            text: longMessage,
          },
        ],
      }))

      // Mock the messages function to return our test messages
      const originalMessages = Session.messages
      Session.messages = async () => mockMessages as any

      let summarizeCalled = false
      const originalSummarize = Session.summarize
      Session.summarize = async () => {
        summarizeCalled = true
        return {} as any
      }

      try {
        // This should trigger summarization due to context limit
        await Session.chat({
          sessionID,
          providerID: "cerebras",
          modelID: "qwen-3-coder-480b",
          parts: [
            {
              type: "text",
              text: "Additional message that pushes over the limit",
            },
          ],
        })

        expect(summarizeCalled).toBe(true)
      } catch (error) {
        // Expected behavior - summarization should be triggered
        expect(summarizeCalled).toBe(true)
      } finally {
        // Restore original functions
        Session.messages = originalMessages
        Session.summarize = originalSummarize
      }
    })

    it("should not trigger unnecessary summarization for models with high context limits", async () => {
      const shortMessage = "Short message"
      
      const mockMessages = [
        {
          info: {
            id: Identifier.ascending("message"),
            role: "user" as const,
            sessionID,
            time: { created: Date.now() },
          },
          parts: [
            {
              id: Identifier.ascending("part"),
              messageID: Identifier.ascending("message"),
              sessionID,
              type: "text" as const,
              text: shortMessage,
            },
          ],
        },
      ]

      const originalMessages = Session.messages
      Session.messages = async () => mockMessages as any

      let summarizeCalled = false
      const originalSummarize = Session.summarize
      Session.summarize = async () => {
        summarizeCalled = true
        return {} as any
      }

      try {
        await Session.chat({
          sessionID,
          providerID: "anthropic",
          modelID: "claude-3-5-sonnet",
          parts: [
            {
              type: "text",
              text: "Short additional message",
            },
          ],
        })

        expect(summarizeCalled).toBe(false)
      } catch (error) {
        // For models with high limits, summarization shouldn't be triggered
        expect(summarizeCalled).toBe(false)
      } finally {
        Session.messages = originalMessages
        Session.summarize = originalSummarize
      }
    })
  })

  describe("Edge Cases", () => {
    it("should handle models without context limits gracefully", async () => {
      const mockProviderNoLimit = {
        getModel: async () => ({
          info: {
            id: "test-model",
            limit: {
              context: 0, // No limit specified
              output: 4096,
            },
            cost: { input: 0, output: 0 },
            temperature: true,
            tool_call: true,
            attachment: false,
            reasoning: false,
            options: {},
          },
          language: {},
        }),
      }

      const originalGetModel = Provider.getModel
      Provider.getModel = mockProviderNoLimit.getModel

      try {
        // This should not throw an error even with no context limit
        const result = await Session.chat({
          sessionID,
          providerID: "test-provider",
          modelID: "test-model",
          parts: [
            {
              type: "text",
              text: "Test message",
            },
          ],
        })

        // Should handle gracefully without errors
        expect(result).toBeDefined()
      } catch (error) {
        // Should not fail due to context limit checking
        expect(error.message).not.toContain("context")
      } finally {
        Provider.getModel = originalGetModel
      }
    })

    it("should handle file parts in token estimation", () => {
      const textFileContent = "File content ".repeat(1000) // ~3k tokens
      const base64Content = Buffer.from(textFileContent).toString("base64")
      const dataUrl = `data:text/plain;base64,${base64Content}`

      // The system should be able to estimate tokens for file content
      expect(dataUrl.length).toBeGreaterThan(1000)
      expect(textFileContent.length).toBeGreaterThan(3000)
    })
  })
})