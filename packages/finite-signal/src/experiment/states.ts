import { create, cycle, effect } from "../mekk"
import { machine, StateTwo } from "./example"

export const StateOne = create.state(() => ({
  machine,
  life: [
    cycle({
      name: `StateOne`,
      run: effect(() => {
        console.log(`StateOne effect`)
      }),
      thenGoTo: () => StateTwo,
    }),
  ],
}))
