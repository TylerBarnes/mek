import { create, cycle } from "./mek"
import fs from "fs"
import fsp from "fs/promises"
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

const getFilePath = (name: number | string) =>
  path.join(__dirname, `/files/${name}.txt`)
const writeFile = (name: number | string) =>
  fs.writeFileSync(getFilePath(name), `hello world`)
const writeFileAsync = (name: number | string) =>
  fsp.writeFile(getFilePath(name), `hello world`)

const iterationMax = 20_000
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

let StateOne = create.state(() => ({
  machine,
  life: [
    cycle({
      name: `only cycle`,
      if: () => counter <= iterationMax - 1,
      run: () => {
        counter++
        writeFile(counter)
      },
      thenGoTo: StateOne,
    }),
  ],
}))

machine.start()

machine
  .onStop()
  .finally(() => {
    const endTime = Date.now() - startTime

    console.log({
      transitionCount: counter,
      duration: `${endTime}ms`,
    })
  })
  .then(async () => {
    recreateFilesDir()

    const loopBench = async () => {
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

      recreateFilesDir()

      let asyncCount = 0
      const asyncStart = Date.now()

      while (asyncCount < iterationMax) {
        asyncCount++
        await writeFileAsync(asyncCount)
      }
      removeFilesDir()
      console.log({
        whileLoopCount: asyncCount,
        endTime: `${Date.now() - asyncStart}ms`,
      })
    }

    let count = 0
    const start = Date.now()

    async function yo() {
      if (count >= iterationMax) {
        console.log({
          recursiveFnCount: count,
          endTime: `${Date.now() - start}ms`,
        })
        await loopBench()
        return
      }
      count++
      writeFile(count)

      if (count % 200 === 0) {
        setImmediate(() => yo())
      } else {
        await yo()
      }
    }

    await yo()
  })
