import { create } from "./src/mek.ts"

// Create machine with states defined inside
const TestMachine = create.machine({
  states: (machine) => {
    const SecondState = create.state({
      machine,
      life: [
        create.cycle({
          effect: create.effect(({ context }) => {
            console.log("Second state effect running with context:", context)
            return { done: true }
          }),
        }),
      ],
    })

    const FirstState = create.state({
      machine,
      life: [
        create.cycle({
          effect: create.effect(({ context }) => {
            console.log("First state effect running with context:", context)
            return { result: "success" }
          }),
          thenGoTo: {
            state: SecondState,
            prepare: (output) => {
              console.log("Preparing data for second state:", output)
              return { fromFirst: output.result }
            },
          },
        }),
      ],
    })

    return {
      first: FirstState,
      second: SecondState,
    }
  },
  initialState: "first",
  onError: (error) => {
    console.error("Machine error:", error.message)
  },
})

// Start machine
console.log("Starting test machine...")
TestMachine.start({ initial: "data" })

// Wait for machine to stop
await TestMachine.onStop()
console.log("Machine stopped.")