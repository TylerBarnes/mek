import { create } from './src/mek'

// Test to verify type inference is working
const cycleWithInference = create.cycle({
  effect: create.effect(() => {
    return { userId: 456, userName: 'Bob' }
  }),
  thenGoTo: {
    state: {} as any,
    prepare: (output) => {
      // This should cause a type error if inference is working
      // TypeScript should know output.userId is a number, not a string
      const id: string = output.userId  // This should error!
      return {
        id: output.userId,
        name: output.userName,
      }
    }
  }
})

console.log('Type error test completed')