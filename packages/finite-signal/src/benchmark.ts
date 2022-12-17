import { create, cycle, effect } from "./mek"
import fs from "fs"
import path from "path"

const filesDir = path.join(__dirname, "files")
const removeFilesDir = () => {
  if (fs.existsSync(filesDir)) {
    fs.rmSync(filesDir, { recursive: true })
  }
}
const recreateFilesDir = () => {
  removeFilesDir()

  fs.mkdirSync(filesDir)
}

recreateFilesDir()

const writeFile = (name: number | string) =>
  fs.writeFileSync(path.join(__dirname, `/files/${name}.txt`), `hello world`)

const iterationMax = 10_000
const startTime = Date.now()
let counter = 0

const machine = create.machine(() => ({
  states: {
    StateOne,
  },

  options: {
    maxTransitionsPerSecond: iterationMax,
  },
}))

let StateOne = create.state({
  machine,
  life: [
    cycle({
      name: `only cycle`,
      condition: () => counter <= iterationMax - 1,
      run: effect(() => {
        counter++
        writeFile(counter)
      }),
      thenGoTo: () => StateOne,
    }),
  ],
})

machine
  .onStop()
  .finally(() => {
    const endTime = Date.now() - startTime

    console.log({
      transitionCount: counter,
      duration: `${endTime}ms`,
    })
  })
  .then(() => {
    recreateFilesDir()

    const loopBench = () => {
      recreateFilesDir()

      let count2 = 0
      const start2 = Date.now()

      while (count2 < iterationMax) {
        count2++
        writeFile(count2)
      }
      removeFilesDir()
      console.log({
        whileLoopCount: count2,
        endTime: `${Date.now() - start2}ms`,
      })
    }

    let count = 0
    const start = Date.now()

    function yo() {
      if (count >= iterationMax) {
        console.log({
          recursiveFnCount: count,
          endTime: `${Date.now() - start}ms`,
        })
        loopBench()
        return
      }
      count++
      writeFile(count)

      if (count % 200 === 0) {
        setImmediate(() => yo())
      } else {
        yo()
      }
    }

    yo()
  })
