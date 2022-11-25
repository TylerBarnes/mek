import { cycle, effect, create } from "../mek"
import { lightMachine } from "./machine"

export const GreenLight = create.state(() => ({
  machine: lightMachine,
  life: [
    cycle({
      run: effect(() => {
        console.log(`GreenLight`)
      }),
    }),
    cycle({
      name: `Go to yellow light`,
      run: effect.wait(2),
      thenGoTo: () => YellowLight,
    }),
  ],
}))

export const YellowLight = create.state(() => ({
  machine: lightMachine,
  life: [
    cycle({
      name: `Go to red light`,
      run: effect.wait(1),
      thenGoTo: () => RedLight,
    }),
  ],
}))

export const RedLight = create.state(() => ({
  machine: lightMachine,
  life: [
    cycle({
      name: `Go to green light`,
      run: effect.wait(2),
      thenGoTo: () => GreenLight,
    }),
  ],
}))

// export const onLightColourChange = lightMachine.signal(
//   effect.onTransition(({ currentState }) => {
//     return { value: currentState.name }
//   })
// )

// export const onGreenLightTransition = lightMachine.signal(
//   effect.onTransition(({ currentState }) => {
//     if (currentState.name === `GreenLight`) {
//       return { value: currentState.name }
//     }

//     return null
//   })
// )
