import { create, cycle, effect } from '../src/mek.js'

// Example showing cycle.decide functionality
// This demonstrates conditional state transitions based on context

const machine = create.machine(() => ({
  states: {
    StartState,
    SuccessState,
    ErrorState,
  },
}))

const StartState = create.state(() => ({
  machine: machine,
  life: [
cycle({
      name: 'checkCondition',
      run: effect(() => {
        console.log('Checking condition for decision...')
        return { shouldProceed: Math.random() > 0.5 }
      }),
    }),
cycle({
      name: 'makeDecision',
      if: (args) => {
        console.log('Decision condition called with context:', args.context)
        return args.context.shouldProceed === true
      },
      thenGoTo: SuccessState,
    }),
    cycle({
      name: 'defaultPath',
      run: effect(() => {
        console.log('Taking default path (condition was false)')
      }),
      thenGoTo: ErrorState,
    }),
  ],
}))

const SuccessState = create.state(() => ({
  machine: machine,
  life: [
    cycle({
      name: 'success',
      run: effect(() => {
        console.log('✅ Success! Condition was true.')
        return { result: 'success' }
      }),
    }),
  ],
}))

const ErrorState = create.state(() => ({
  machine: machine,
  life: [
    cycle({
      name: 'error',
      run: effect(() => {
        console.log('❌ Error! Condition was false.')
        return { result: 'error' }
      }),
      thenGoTo: StartState,
    }),
  ],
}))

console.log('=== Cycle Decide Example ===')
console.log('This example demonstrates conditional state transitions using cycle.decide')
console.log('Each run will randomly choose between success and error paths\n')

machine.start()

// Wait for machine to complete
setTimeout(() => {
  console.log('\nMachine completed')
  machine.stop()
}, 1000)