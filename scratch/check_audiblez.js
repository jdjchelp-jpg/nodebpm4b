const { isAudiblezInstalled } = require('./lib/audiblez-integration');

async function check() {
    const installed = await isAudiblezInstalled();
    console.log('Audiblez installed:', installed);
}

check();
