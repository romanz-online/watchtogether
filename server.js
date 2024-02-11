const QueryHandler = require('./queryHandler');
const constants = require('./constants');
const { KEYS, characters } = constants;

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const httpServer = require('http').createServer(app);
const io = require('socket.io')(httpServer);
let connectedClients = {};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io/client-dist'));

// const dbConfig = process.env.DATABASE_URL ? {
//     connectionString: process.env.DATABASE_URL,
//     ssl: { rejectUnauthorized: false },
//     connectionTimeoutMillis: 5000,
//     idleTimeoutMillis: 10000
// } : {
//     user: 'postgres',
//     host: 'localhost',
//     database: 'watch',
//     password: 'admin',
//     port: 5432,
//     connectionTimeoutMillis: 5000,
//     idleTimeoutMillis: 10000
// };
// const pool = new Pool(dbConfig);

// const queryHandlerInstance = new QueryHandler('watch', pool);

const asURL = (f) => `${__dirname}/public/${f}`;

app.get('/watchroom', (req, res) => {
    console.log('/watchroom');

    const code = req.query.code;
    console.log(code);
    if (code && code.length === 10) {
        res.sendFile(asURL('watchroom.html'));
    } else {
        res.redirect('/');
    }
});

io.on('connection', (socket) => {
    connectedClients[socket.id] = socket;

    socket.on('disconnect', () => {
        delete connectedClients[socket.id];
    });

    socket.on('watcherJoined', (data) => {
        console.log('watcherJoined');
        socket.broadcast.emit('watcherJoined', {
            success: true,
            signature: 'watcherJoined',
            data: {
                code: data.code
            }
        });
    });

    socket.on('loadVideo', (data) => {
        console.log('loadVideo', data.videoID);
        socket.broadcast.emit('loadVideo', {
            success: true,
            signature: 'loadVideo',
            data: {
                code: data.code,
                videoID: data.videoID
            }
        });
    });

    socket.on('play', (data) => {
        console.log('play');
        socket.broadcast.emit('play', {
            success: true,
            signature: 'play',
            data: {
                code: data.code,
                timestamp: data.timestamp
            }
        });
    });

    socket.on('pause', (data) => {
        console.log('pause');
        socket.broadcast.emit('pause', {
            success: true,
            signature: 'pause',
            data: {
                code: data.code,
                timestamp: data.timestamp
            }
        });
    });

    socket.on('rate', (data) => {
        console.log('rate');
        socket.broadcast.emit('rate', {
            success: true,
            signature: 'rate',
            data: {
                code: data.code,
                rate: data.rate
            }
        });
    });

    socket.on('createWatchRoom', () => {
        createWatchRoom(socket);
    });
});

async function createWatchRoom(socket) {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        // const newCode = await generateCode();

        let columns = [KEYS.ROOM_CODE, KEYS.WATCHER_COUNT];
        // let values = [newCode, 1];
        let values = ['1234567890', 1];

        const params = {
            columns: columns,
            values: values
        };
        // await queryHandlerInstance.insert(params);

        socketEmit(socket, signature, true, {
            // code: newCode
            code: '1234567890'
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, signature, false, {});
    }
}








// HELPER METHODS

function socketEmit(socket, signature, success, data) {
    socket.emit(`${signature}Response`, {
        success: success,
        signature: signature,
        data: data
    });
}

async function generateCode() {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        while (true) {
            let code = '';

            for (let i = 0; i < 10; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                code += characters.charAt(randomIndex);
            }

            const record = getRowFromCode(code);

            if (!record.rows) {
                return code;
            } else {
                console.log(`code ${code} was not unique. Trying again...`);
            }
        }
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function getRowFromCode(code) {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        const params = { where: [{ key: KEYS.CODE, value: code }] };
        const result = await queryHandlerInstance.select(params);

        // query only ever returns one row since code is unique
        return result[0];
    } catch (err) {
        console.error(err);
        throw err;
    }
}

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => { console.log(`Server is running at http://localhost:${PORT}`); });
