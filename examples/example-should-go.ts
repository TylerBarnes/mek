import { create, cycle } from '../src/mek.js'

// This example demonstrates the shouldGo functionality
// shouldGo determines whether to transition after running the cycle

// Track iterations for demo purposes
let iterations = 0
const MAX_ITERATIONS = 10

// Define the machine
const ProcessingMachine = create.machine(() => ({
  name: `ProcessingMachine`,
  states: {
    ProcessingState,
    SuccessState,
    ErrorState,
    CompleteState,
  },
  initialState: ProcessingState,
}))

const ProcessingState = create.state(() => ({
  machine: ProcessingMachine,
  life: [
    // First cycle: Process data
    cycle({
      name: `processData`,
      run: () => {
        console.log(`Processing data...`)
        // Simulate some processing that might succeed or fail
        const success = Math.random() > 0.5
        console.log(`Processing ${success ? 'succeeded' : 'failed'}`)
        return { success }
      },
    }),
    
    // Second cycle: Transition to success state if processing succeeded
    cycle({
      name: `checkSuccess`,
      shouldGo: ({ context }) => {
        // Only transition if processing succeeded
        console.log(`Checking success: context.success = ${context.success}`)
        return context.success === true
      },
      thenGoTo: SuccessState,
    }),
    
    // Third cycle: Transition to error state if processing failed
    cycle({
      name: `checkError`,
      shouldGo: ({ context }) => {
        // Only transition if processing failed
        console.log(`Checking error: context.success = ${context.success}`)
        return context.success === false
      },
      thenGoTo: ErrorState,
    }),
  ],
}))

const SuccessState = create.state(() => ({
  machine: ProcessingMachine,
  life: [
    cycle({
      name: `handleSuccess`,
      run: () => {
        console.log(`✅ Data processed successfully!`)
        console.log(`---`)
        iterations++
      },
      shouldGo: () => iterations < MAX_ITERATIONS,
      thenGoTo: ProcessingState,
    }),
    cycle({
      name: `complete`,
      shouldGo: () => iterations >= MAX_ITERATIONS,
      thenGoTo: CompleteState,
    }),
  ],
}))

const ErrorState = create.state(() => ({
  machine: ProcessingMachine,
  life: [
    cycle({
      name: `handleError`,
      run: () => {
        console.log(`❌ Data processing failed! Retrying...`)
        console.log(`---`)
        iterations++
      },
      shouldGo: () => iterations < MAX_ITERATIONS,
      thenGoTo: ProcessingState,
    }),
    cycle({
      name: `complete`,
      shouldGo: () => iterations >= MAX_ITERATIONS,
      thenGoTo: CompleteState,
    }),
  ],
}))

const CompleteState = create.state(() => ({
  machine: ProcessingMachine,
  life: [
    cycle({
      name: `complete`,
      run: () => {
        console.log(`🏁 Processing complete after ${iterations} iterations.`)
      },
    }),
  ],
}))

ProcessingMachine.start()