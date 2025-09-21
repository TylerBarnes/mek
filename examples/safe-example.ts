import { create, cycle } from "@tylerb/mek"

// Create a machine with a safeguard against infinite loops
const SafeMachine = create.machine(() => ({
  name: "SafeMachine",
  options: {
    maxTransitionsPerSecond: 1000 // Prevent infinite loops by limiting transitions
  },
  states: {
    Start,
    Middle,
    End,
  },
  initialState: Start,
}))

const Start = create.state(() => ({
  machine: SafeMachine,
  life: [
    cycle({
      name: "Start Cycle",
      run: () => {
        console.log("Starting the machine...");
      },
      thenGoTo: Middle,
    })
  ],
}))

const Middle = create.state(() => ({
  machine: SafeMachine,
  life: [
    cycle({
      name: "Middle Cycle",
      run: () => {
        console.log("In the middle state.");
      },
      thenGoTo: End,
    })
  ],
}))

const End = create.state(() => ({
  machine: SafeMachine,
  life: [
    cycle({
      name: "End Cycle",
      run: () => {
        console.log("Machine completed successfully!");
      },
    })
  ],
}))

// Start the machine with a timeout to prevent hanging
console.log("Starting safe example with infinite loop safeguard...")
SafeMachine.start()

// Stop after 5 seconds to prevent hanging
setTimeout(() => {
  console.log("Stopping machine after 5 seconds...")
  SafeMachine.stop()
}, 5000)