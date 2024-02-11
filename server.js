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

const dbConfig = process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
} : {
    user: 'postgres',
    host: 'localhost',
    database: 'watch',
    password: 'admin',
    port: 5432,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
};
const pool = new Pool(dbConfig);

const queryHandlerInstance = new QueryHandler('watch', pool);

const asURL = (f) => `${__dirname}/public/${f}`;

app.get('/watchroom', (req, res) => {
    const code = req.query.code;
    if (code && code.length === 5) {
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
        const { roomCode } = data;
        socket.broadcast.emit('watcherJoined', { data: { roomCode: roomCode } });
    });

    socket.on('play', (data) => {
        console.log('play');
        const { timestamp } = data;
        socket.broadcast.emit('play', { data: { timestamp: timestamp } });
    });

    socket.on('pause', (data) => {
        console.log('pause');
        const { timestamp } = data;
        socket.broadcast.emit('pause', { data: { timestamp: timestamp } });
    });

    socket.on('rate', (data) => {
        console.log('rate');
        const { rate } = data;
        socket.broadcast.emit('rate', { data: { rate: rate } });
    });

    socket.on('createWatchRoom', (data) => {
        const { } = data;
        createWatchRoom(socket);
    });
});





async function createWatchRoom(socket, clientID, playerCount) {
    const signature = arguments.callee.name;
    console.log(signature);
    
    try {
        const newRoomCode = await generateRoomCode();

        let columns = [KEYS.ROOM_CODE, KEYS.WATCHER_COUNT];
        let values = [newRoomCode, 1];

        const params = {
            columns: columns,
            values: values
        };
        await queryHandlerInstance.insert(params);

        socketEmit(socket, signature, true, {
            roomCode: newRoomCode
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

async function generateRoomCode() {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        while (true) {
            let roomCode = '';

            for (let i = 0; i < 5; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                roomCode += characters.charAt(randomIndex);
            }

            const record = getRowFromRoomCode(roomCode);

            if (!record.rows) {
                return roomCode;
            } else {
                console.log(`roomCode ${roomCode} was not unique. Trying again...`);
            }
        }
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function getRowFromRoomCode(roomCode) {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        const params = { where: [{ key: KEYS.ROOM_CODE, value: roomCode }] };
        const result = await queryHandlerInstance.select(params);

        // query only ever returns one row since roomCode is unique
        return result[0];
    } catch (err) {
        console.error(err);
        throw err;
    }
}

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => { console.log(`Server is running at http://localhost:${PORT}`); });
