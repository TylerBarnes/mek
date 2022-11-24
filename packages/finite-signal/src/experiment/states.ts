import { create, cycle, effect } from "../mek"
import { machine, StateTwo } from "./example"

export const StateOne = create.state(() => ({
  machine,
  life: [
    cycle({
      name: `Go to StateTwo`,
      run: effect(() => {
        console.log(`StateOne effect`)
      }),
      thenGoTo: () => StateTwo,
    }),
  ],
}))
