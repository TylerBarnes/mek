import { cycle, effect, state } from "../index"
import { lightMachine } from "./machine"

console.log(1, { lightMachine })
setImmediate(() => {
  console.log(2, { lightMachine })
})

// export const GreenLight = state(lightMachine, {
//   life: [
//     cycle({
//       run: effect.wait(3),
//     }),
//     cycle({
//       name: `Go to yellow light`,
//       run: effect.wait(2),
//       thenGoTo: () => YellowLight,
//     }),
//   ],
// })

// export const YellowLight = state(lightMachine, {
//   life: [
//     cycle({
//       name: `Go to red light`,
//       run: effect.wait(1),
//       thenGoTo: () => RedLight,
//     }),
//   ],
// })

export const RedLight = state(lightMachine, {
  life: [
    cycle({
      name: `Go to green light`,
      run: effect.wait(2),
      thenGoTo: () => RedLight,
      // thenGoTo: () => GreenLight,
    }),
  ],
})

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
