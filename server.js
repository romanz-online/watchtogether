const constants = require('./constants');
const {
    WATCH_ROOM_TABLE,
    WATCH_ROOM_USER_TABLE,
    WATCH_ROOM_KEYS,
    WATCH_ROOM_USER_KEYS,
    characters
} = constants;

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const httpServer = require('http').createServer(app);
const io = require('socket.io')(httpServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io/client-dist'));
const cron = require('node-cron');

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

let connectedClients = {};
let emptyRooms = {};

cron.schedule('* * * * *', () => { deleteOldRecords(); });

const asURL = (f) => `${__dirname}/public/${f}`;

app.get('/watchroom', (req, res) => {
    console.log('/watchroom');

    const roomCode = req.query.roomCode;
    console.log(roomCode);

    res.sendFile(asURL((roomCode && roomCode.length === 10) ? 'watchroom.html' : 'index.html'));
});

io.on('connection', (socket) => {
    connectedClients[socket.id] = socket;

    socket.on('disconnect', () => {
        delete connectedClients[socket.id];
    });

    socket.on('watcherJoin', (data) => {
        watcherJoin(socket, data.roomCode);
    });

    socket.on('watcherLeave', (data) => {
        watcherLeave(socket, data.roomCode);
        // remove socket id from SQL row with data.roomCode
        if (true /* there are no watchers in the room */) {
            emptyRooms[roomCode] = roomCode;
        }
    });

    socket.on('loadVideo', (data) => {
        emitToRoomWatchers(socket, data.roomCode, 'loadVideo', {
            roomCode: data.roomCode,
            videoID: data.videoID
        });
    });

    socket.on('play', (data) => {
        emitToRoomWatchers(socket, data.roomCode, 'play', {
            roomCode: data.roomCode,
            timestamp: data.timestamp
        });
    });

    socket.on('pause', (data) => {
        emitToRoomWatchers(socket, data.roomCode, 'pause', {
            roomCode: data.roomCode,
            timestamp: data.timestamp
        });
    });

    socket.on('rate', (data) => {
        emitToRoomWatchers(socket, data.roomCode, 'rate', {
            roomCode: data.roomCode,
            rate: data.rate
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
        const newCode = await generateRoomCode();

        const query = [
            `INSERT INTO ${WATCH_ROOM_TABLE}`,
            `(${WATCH_ROOM_KEYS.ROOM_CODE})`,
            `VALUES ('${newCode}');`
        ];
        const result = await executeQuery(query);

        socketEmit(socket, signature, true, {
            roomCode: newRoomCode
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, signature, false, {});
    }
}

async function watcherJoin(socket, roomCode) {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        const query = [
            `INSERT INTO ${WATCH_ROOM_USER_TABLE}`,
            `(${WATCH_ROOM_USER_KEYS.ROOM_CODE}, ${WATCH_ROOM_USER_KEYS.SOCKET_ID})`,
            `VALUES ('${roomCode}', '${socket.id}');`
        ];
        const result = await executeQuery(query);

        emitToRoomWatchers(socket, roomCode, signature, {});
    } catch (err) {
        console.error(err);
        socketEmit(socket, signature, false, {});
    }
}

async function watcherLeave(socket, roomCode) {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        const query = [
            `DELETE FROM ${WATCH_ROOM_USER_TABLE}`,
            `WHERE ${WATCH_ROOM_USER_KEYS.ROOM_CODE}='${roomCode}'`,
            `AND ${WATCH_ROOM_USER_KEYS.SOCKET_ID}='${socket.id}');`
        ];
        const result = await executeQuery(query);

        let notifiedCount = emitToRoomWatchers(socket, roomCode, signature, { roomCode: data.roomCode });

        if (notifiedCount === 0) {
            const query1 = [
                `UPDATE ${WATCH_ROOM_TABLE}`,
                `SET ${WATCH_ROOM_KEYS.EMPTY_SINCE}=NOW()`,
                `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}');`
            ];
            const result1 = await executeQuery(query1);
        }
    } catch (err) {
        console.error(err);
        socketEmit(socket, signature, false, {});
    }
}

async function deleteOldRecords() {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        // delete every room that's in emptyRooms and which passes the query with `NOW() - INTERVAL '5 minutes'`

        // const params = { where: [{ key: `${WATCH_ROOM_KEYS.LAST_MODIFIED}<`, value: `NOW() - INTERVAL '5 minutes'`, type: 'SQL' }] };
        // await queryHandlerInstance.delete(params);
    } catch (err) {
        console.error(err);
    }
}







// HELPER METHODS

async function emitToRoomWatchers(socket, roomCode, signal, data) {
    const signature = arguments.callee.name;
    console.log(signature, signal, data);

    try {
        let count = 0;
        const result = await getUsersFromRoomCode(roomCode);
        for (const row of result) {
            const socket_id = row[WATCH_ROOM_USER_KEYS.SOCKET_ID];
            if (socket_id !== socket.id) {
                socketEmit(connectedClients[socket_id], signal, true, data);
                count++;
            }
        }
        return count;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

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

            for (let i = 0; i < 10; i++) {
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
        const query = [
            `SELECT 1 FROM ${WATCH_ROOM_TABLE}`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result = await executeQuery(query);

        return result[0];
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function getUsersFromRoomCode(roomCode) {
    const signature = arguments.callee.name;
    console.log(signature);

    try {
        const query = [
            `SELECT * FROM ${WATCH_ROOM_USER_TABLE}`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result = await executeQuery(query);

        return result;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function executeQuery(query) {
    const queryString = query.join(' ');
    const client = await pool.connect();
    const { rows } = await client.query(queryString);
    client.release();
    return rows;
}

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => { console.log(`Server is running at http://localhost:${PORT}`); });
