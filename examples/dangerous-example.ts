import { create, cycle } from "@tylerb/mek"

// This would cause an infinite loop without safeguards
const DangerousMachine = create.machine(() => ({
  name: "DangerousMachine",
  options: {
    maxTransitionsPerSecond: 1000 // This safeguard will prevent infinite loops
  },
  states: {
    LoopState,
  },
  initialState: LoopState,
}))

const LoopState = create.state(() => ({
  machine: DangerousMachine,
  life: [
    cycle({
      name: "Infinite Loop Cycle",
      run: () => {
        console.log("This would loop infinitely without safeguards!");
      },
      thenGoTo: LoopState, // This creates a self-transition
    })
  ],
}))

console.log("Starting dangerous example - safeguard will prevent infinite loop...")
DangerousMachine.start()

// Stop after 3 seconds to show the safeguard works
setTimeout(() => {
  console.log(`Machine stopped after ${DangerousMachine.transitionCount} transitions`)
  console.log("Notice: The safeguard prevented an infinite loop!")
  DangerousMachine.stop()
}, 3000)