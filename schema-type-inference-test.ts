import * as v from 'valibot'

// Define schemas
const LoginSchema = v.object({
  username: v.string(),
  password: v.string(),
})

const UserSchema = v.object({
  id: v.number(),
  name: v.string(),
  email: v.string(),
})

const DashboardSchema = v.object({
  userId: v.number(),
  displayName: v.string(),
})

// Test the type inference manually
type ThenGoToDefinition<TOutput, TNextInput> = {
  state: any
  prepare?: (output: TOutput) => TNextInput
}

// This should work - output is UserSchema type, prepare returns DashboardSchema type
const thenGoTo: ThenGoToDefinition<v.InferOutput<typeof UserSchema>, v.InferOutput<typeof DashboardSchema>> = {
  state: {} as any,
  prepare: (output) => {
    // TypeScript should know output has id, name, email
    console.log(output.id)
    console.log(output.name)
    console.log(output.email)
    
    // TypeScript should enforce that we return userId and displayName
    return {
      userId: output.id,
      displayName: output.name
    }
  }
}

// Test with a wrong type to make sure TypeScript catches it
const thenGoToWrong: ThenGoToDefinition<v.InferOutput<typeof UserSchema>, v.InferOutput<typeof DashboardSchema>> = {
  state: {} as any,
  prepare: (output) => {
    // This should cause a type error
    return {
      userId: output.id,
      displayName: output.name,
      // extraField: 'this should error' // Uncomment to test type checking
    }
  }
}

console.log('Schema type inference test completed')