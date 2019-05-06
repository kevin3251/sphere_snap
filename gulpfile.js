const fs = require('fs')
const axios = require('axios')
const { src, dest, series } = require('gulp')

const targets = {
    'arm-linux-gnu': 'mbStack_LARM',
    'x86_64-linux-gnu': 'mbStack_L64',
    'amd64': 'mbStack_L64',
    'arm': 'mbStack_LARM'
}

const defaultTask = () => new Promise(async (resolve, reject) => {

    const arch = process.env.SNAPCRAFT_ARCH_TRIPLET || process.env.ARCH
    console.log(arch)
    const target = targets[arch]

    if (!target) {
        let error = new Error("Not such target!!!")
        reject(error)
    }

    const file = fs.createWriteStream("motebus")
    const url = `https://github.com/motebus/motebus/releases/latest/download/${target}`
    const resp = await axios.get(url, { responseType: 'stream' })
    resp.data.pipe(file)

    file.on('finish', () => {
        file.close()
        fs.chmodSync('motebus', '755')
        resolve()
    })

    file.on('error', (err) => {
        fs.unlink('motebus')
        reject(err)
    })
})

function install() {
    return src('motebus')
        .pipe(dest('../install'))
}

exports.default = defaultTask
exports.install = series(defaultTask, install)