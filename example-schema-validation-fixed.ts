import { create } from "./src/mek"
import * as v from "valibot"

// Define schemas using Valibot
const LoginSchema = v.object({
  username: v.string(),
  password: v.string(),
})

const UserSchema = v.object({
  id: v.number(),
  name: v.string(),
  email: v.string(),
})

// Create machine (using function to avoid circular reference)
const AuthMachine = create.machine(() => ({
  states: {
    Login: LoginState,
    Dashboard: DashboardState,
  },
  initialState: LoginState,
  onError: (error) => {
    console.error("Machine error:", error)
  },
}))

// Create states with input/output schemas (using functions to avoid circular reference)
const LoginState = create.state(() => ({
  machine: AuthMachine,
  input: LoginSchema,
  output: UserSchema,
  life: [
    create.cycle({
      effect: async ({ context }) => {
        console.log("🔐 Login effect running with:", context)
        // Simulate login API call
        const user = {
          id: 1,
          name: "John Doe",
          email: `${context.username}@example.com`,
        }
        console.log("✅ Login successful, returning user:", user)

        // This will be validated against UserSchema before transitioning
        return user
      },
      thenGoTo: {
        state: DashboardState,
        prepare: (output) => {
          // Transform user data to dashboard context
          console.log("🔄 Transforming data for dashboard:", output)
          return {
            userId: output.id,
            displayName: output.name,
          }
        },
      },
    }),
  ],
}))

const DashboardState = create.state(() => ({
  machine: AuthMachine,
  input: v.object({
    userId: v.number(),
    displayName: v.string(),
  }),
  life: [
    create.cycle({
      effect: create.effect(({ context }) => {
        console.log(
          `🎉 Welcome ${context.displayName} (User ID: ${context.userId})!`,
        )
        // Machine will stop after this
        return { success: true }
      }),
    }),
  ],
}))

// Start machine with initial context
console.log("🚀 Starting machine with login credentials...")
AuthMachine.start({
  username: "johndoe",
  password: "secret123",
})

// Wait for machine to stop
await AuthMachine.onStop()
console.log("🛑 Machine stopped.")
