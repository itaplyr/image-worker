import fetch from 'node-fetch';

async function test() {
    try {
        // Test with 420x420
        const response = await fetch('https://thumbnails.roblox.com/v1/assets?assetIds=1028606,1028720&size=420x420&format=Png&isCircular=false');
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

test();
