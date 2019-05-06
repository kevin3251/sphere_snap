const https = require('https')
const fs = require('fs')
const { src, dest, series } = require('gulp')

const targets = {
    'arm-linux-gnu': 'mbStack_LARM',
    'x86_64-linux-gnu': 'mbStack_L64',
    'amd64': 'mbStack_L64',
    'arm': 'mbStack_LARM'
}

const defaultTask = () => new Promise((resolve, reject) => {
    
    const arch = process.env.SNAPCRAFT_ARCH_TRIPLET || process.env.ARCH
    console.log(arch)
    const target = targets[arch]

    if (!target) {
        let error = new Error("Not such target!!!")
        reject(error)
    }

    const file = fs.createWriteStream("motebus")
    const request = https.get(
        `https://github.com/motebus/motebus/releases/latest/download/${target}`,
        (resp) => {
            resp.pipe(file)
        }
    )

    file.on('finish', () => {
        file.close()
        fs.chmodSync('motebus', '755')
        resolve()
    })

    request.on('error', (err) => {
        fs.unlink('motebus')
        reject(err)
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