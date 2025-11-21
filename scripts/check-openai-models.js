#!/usr/bin/env node

/**
 * Script to check available OpenAI models via API
 * Run with: node scripts/check-openai-models.js
 * 
 * Requires OPENAI_API_KEY environment variable
 */

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  console.error("❌ OPENAI_API_KEY environment variable is not set")
  console.log("\nTo set it, run:")
  console.log("  export OPENAI_API_KEY=sk-your-key-here")
  process.exit(1)
}

async function checkModels() {
  try {
    console.log("🔍 Checking available OpenAI models...\n")
    
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API Error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    const models = data.data || []

    // Filter models with vision capabilities
    // Vision-capable models typically include: gpt-4o, gpt-4-turbo, gpt-4-vision-preview, gpt-5.x
    const visionModels = models
      .filter((m) => {
        const id = m.id.toLowerCase()
        return (
          id.includes("gpt-4o") ||
          id.includes("gpt-4-turbo") ||
          id.includes("gpt-4-vision") ||
          id.includes("gpt-5") ||
          id.includes("vision")
        )
      })
      .sort((a, b) => {
        // Sort by ID to group similar models
        return a.id.localeCompare(b.id)
      })

    if (visionModels.length === 0) {
      console.log("⚠️  No vision-capable models found in your account")
      console.log("\nAvailable models (first 10):")
      models.slice(0, 10).forEach((m) => {
        console.log(`  - ${m.id}`)
      })
      return
    }

    console.log("✅ Vision-capable models found:\n")
    visionModels.forEach((model) => {
      const isLatest = model.id.includes("gpt-5") || model.id.includes("gpt-4o")
      const marker = isLatest ? "⭐" : "  "
      console.log(`${marker} ${model.id}`)
      if (model.owned_by) {
        console.log(`     Owned by: ${model.owned_by}`)
      }
    })

    // Check specifically for GPT-5.1
    const gpt51Models = visionModels.filter((m) =>
      m.id.toLowerCase().includes("gpt-5.1") || m.id.toLowerCase().includes("gpt-5-1")
    )

    console.log("\n" + "=".repeat(50))
    if (gpt51Models.length > 0) {
      console.log("\n✅ GPT-5.1 models found:")
      gpt51Models.forEach((m) => {
        console.log(`   Model ID: ${m.id}`)
        console.log(`   Use in .env: OPENAI_MODEL=${m.id}`)
      })
    } else {
      console.log("\n⚠️  GPT-5.1 not found in available models")
      console.log("   Current vision models:")
      visionModels.forEach((m) => {
        console.log(`   - ${m.id}`)
      })
      console.log("\n   To use GPT-5.1, ensure:")
      console.log("   1. You have access to GPT-5.1 (may require waitlist)")
      console.log("   2. The model name is exactly: gpt-5.1")
      console.log("   3. Check OpenAI dashboard for model availability")
    }

    console.log("\n" + "=".repeat(50))
    console.log("\n💡 Recommended model for vision tasks:")
    const recommended = visionModels.find((m) => m.id.includes("gpt-4o")) || visionModels[0]
    if (recommended) {
      console.log(`   ${recommended.id}`)
      console.log(`   Set in .env: OPENAI_MODEL=${recommended.id}`)
    }
  } catch (error) {
    console.error("❌ Error checking models:", error.message)
    if (error.message.includes("401")) {
      console.log("\n💡 Your API key may be invalid or expired")
    } else if (error.message.includes("429")) {
      console.log("\n💡 Rate limit exceeded, try again later")
    }
    process.exit(1)
  }
}

checkModels()

