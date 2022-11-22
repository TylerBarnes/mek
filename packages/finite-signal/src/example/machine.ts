import { createMachine } from "../index"
import {
  //   GreenLight,
  //   YellowLight,
  RedLight,
  //   onLightColourChange,
  //   onGreenLightTransition,
} from "./states"

export const lightMachine = createMachine(() => ({
  states: {
    RedLight,
    // GreenLight,
    // YellowLight,
  },

  onError: (e) => {
    console.error(e)
  },

  signals: {
    // onLightColourChange,
    // onGreenLightTransition,
  },
}))

console.log(5, { lightMachine })

// export { onGreenLightTransition, onLightColourChange }
