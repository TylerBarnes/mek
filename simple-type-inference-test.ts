import { create } from './src/mek'

// Test the type inference between effect return type and prepare function parameter
const effectFn = create.effect(() => {
  return { userId: 123, userName: 'Alice' }
})

// Test if we can manually create a ThenGoToDefinition with proper type inference
type ThenGoToDefinition<TOutput, TNextInput> = {
  state: any // Simplified for this test
  prepare?: (output: TOutput) => TNextInput
}

const thenGoToDef: ThenGoToDefinition<{ userId: number; userName: string }, { id: number; name: string }> = {
  state: {} as any,
  prepare: (output) => {
    // TypeScript should know that output has userId (number) and userName (string)
    return {
      id: output.userId,      // This should be properly typed
      name: output.userName,  // This should be properly typed
    }
  }
}

// Test with create.cycle to see if type inference works
const cycleWithInference = create.cycle({
  effect: create.effect(() => {
    return { userId: 456, userName: 'Bob' }
  }),
  thenGoTo: {
    state: {} as any,
    prepare: (output) => {
      // Check if TypeScript infers the type here
      // output should be { userId: number, userName: string }
      return {
        id: output.userId,
        name: output.userName,
      }
    }
  }
})

console.log('Type inference test completed')