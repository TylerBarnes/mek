import { create, cycle, effect } from "../mek"
import { StateOne } from "./states"

export const machine = create.machine(() => ({
  states: {
    StateOne,
    StateTwo,
  },
}))

export const StateTwo = create.state({
  machine,

  life: [
    cycle({
      name: `StateTwo`,
      run: effect(() => {
        console.log(`StateTwo effect`)
      }),
    }),
    cycle({
      name: `keep machine alive`,
      run: effect.wait(),
    }),
  ],
})
