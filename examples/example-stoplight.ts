import { create, cycle } from "@tylerb/mek"

const StoplightMachine = create.machine(() => ({
  name: "StoplightMachine",
  states: {
    Green,
    Yellow,
    Red,
  },
  initialState: Green,
}))

const Green = create.state(() => ({
  machine: StoplightMachine,
  life: [
    cycle({
      name: "Green",
      run: () => {
        console.log("Green light is on.");
      },
      thenGoTo: Yellow,
      if: () => StoplightMachine.transitionCount >= 0,
    })
  ],
}))

const Yellow = create.state(() => ({
  machine: StoplightMachine,
  life: [
    cycle({
      name: "Yellow",
      run: () => {
        console.log("Yellow light is on.");
      },
      thenGoTo: Red,
      if: () => StoplightMachine.transitionCount >= 1,
    })
  ],
}))

const Red = create.state(() => ({
  machine: StoplightMachine,
  life: [
    cycle({
      name: "Red",
      run: () => {
        console.log("Red light is on.");
      },
      thenGoTo: Green,
      if: () => StoplightMachine.transitionCount >= 2,
    })
  ],
}))

StoplightMachine.start();