const fs = require('fs');

async function testUpload() {
    try {
        const blob = new Blob(['fake image content'], { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('file', blob, 'test.jpg');
        formData.append('repairId', '1');
        formData.append('category', 'debug');

        const res = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });

        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

testUpload();
