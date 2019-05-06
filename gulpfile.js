const https = require('https')
const fs = require('fs')

const targets = {
    'arm-linux-gnu': 'mbStack_LARM',
    'x86_64-linux-gnu': 'mbStack_L64',
    'amd64': 'mbStack_L64',
    'arm': 'mbStack_LARM'
}

async function defaultTask() {

    const target = targets[
        process.env.SNAPCRAFT_ARCH_TRIPLET ||
        process.env.ARCH
    ]

    if (!target) {
        let error = new Error("Not such target!!!")
        throw error
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
    })

    request.on('error', (err) => { fs.unlink('motebus') })
    file.on('error', (err) => { fs.unlink('motebus') })

    return
}

exports.default = defaultTask