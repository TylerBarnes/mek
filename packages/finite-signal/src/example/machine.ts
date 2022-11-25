import { create } from "../mek"
import {
  GreenLight,
  YellowLight,
  RedLight,
  //   onLightColourChange,
  //   onGreenLightTransition,
} from "./states"

export const lightMachine = create.machine(() => ({
  states: {
    RedLight,
    GreenLight,
    YellowLight,
  },

  onError: (e) => {
    console.error(e)
  },

  signals: {
    // onLightColourChange,
    // onGreenLightTransition,
  },
}))

// export { onGreenLightTransition, onLightColourChange }
