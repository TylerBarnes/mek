import { define } from "../mekk"
import { StateOne } from "./states"

export const machine = define.machine(() => ({
  states: {
    StateOne,
    StateTwo,
  },
}))

const StateTwo = define.state(() => ({
  machine,
}))

setInterval(() => {}, 1000)
