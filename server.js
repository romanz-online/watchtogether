const cron = require('node-cron');
const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const app = express();
const httpServer = require('http').createServer(app);
const io = require('socket.io')(httpServer);
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

const constants = require('./constants');
const {
    WATCH_ROOM_TABLE,
    WATCH_ROOM_USER_TABLE,
    WATCH_ROOM_KEYS,
    WATCH_ROOM_USER_KEYS,
    CHARACTERS,
    SIGNALS
} = constants;

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

io.on(SIGNALS.CONNECTION, (socket) => {
    connectedClients[socket.id] = socket;

    socket.on(SIGNALS.DISCONNECT, () => {
        delete connectedClients[socket.id];
    });

    socket.on(SIGNALS.WATCHER_JOIN, (data) => {
        watcherJoin(socket, data.roomCode);
    });

    socket.on(SIGNALS.WATCHER_LEAVE, (data) => {
        watcherLeave(socket, data.roomCode);
    });

    socket.on(SIGNALS.LOAD_VIDEO, (data) => {
        emitToRoomWatchers(socket, data.roomCode, SIGNALS.LOAD_VIDEO, {
            roomCode: data.roomCode,
            videoID: data.videoID
        });
    });

    socket.on(SIGNALS.PLAY, (data) => {
        emitToRoomWatchers(socket, data.roomCode, SIGNALS.PLAY, {
            roomCode: data.roomCode,
            timestamp: data.timestamp
        });
    });

    socket.on(SIGNALS.PAUSE, (data) => {
        emitToRoomWatchers(socket, data.roomCode, SIGNALS.PAUSE, {
            roomCode: data.roomCode,
            timestamp: data.timestamp
        });
    });

    socket.on(SIGNALS.RATE, (data) => {
        emitToRoomWatchers(socket, data.roomCode, SIGNALS.RATE, {
            roomCode: data.roomCode,
            rate: data.rate
        });
    });

    socket.on(SIGNALS.CREATE_WATCH_ROOM, () => {
        createWatchRoom(socket);
    });
});

async function createWatchRoom(socket) {
    console.log(arguments.callee.name);

    try {
        const newCode = await generateRoomCode();

        const query = [
            `INSERT INTO ${WATCH_ROOM_TABLE}`,
            `(${WATCH_ROOM_KEYS.ROOM_CODE})`,
            `VALUES ('${newCode}');`
        ];
        const result = await executeQuery(query);

        socketEmit(socket, SIGNALS.CREATE_WATCH_ROOM, true, {
            roomCode: newRoomCode
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, SIGNALS.CREATE_WATCH_ROOM, false, {});
    }
}

async function watcherJoin(socket, roomCode) {
    console.log(arguments.callee.name);

    try {
        const query = [
            `INSERT INTO ${WATCH_ROOM_USER_TABLE}`,
            `(${WATCH_ROOM_USER_KEYS.ROOM_CODE}, ${WATCH_ROOM_USER_KEYS.SOCKET_ID})`,
            `VALUES ('${roomCode}', '${socket.id}');`
        ];
        const result = await executeQuery(query);

        delete emptyRooms[roomCode];

        emitToRoomWatchers(socket, roomCode, SIGNALS.WATCHER_JOIN, {});
    } catch (err) {
        console.error(err);
        socketEmit(socket, SIGNALS.WATCHER_JOIN, false, {});
    }
}

async function watcherLeave(socket, roomCode) {
    console.log(arguments.callee.name);

    try {
        const query = [
            `DELETE FROM ${WATCH_ROOM_USER_TABLE}`,
            `WHERE ${WATCH_ROOM_USER_KEYS.ROOM_CODE}='${roomCode}'`,
            `AND ${WATCH_ROOM_USER_KEYS.SOCKET_ID}='${socket.id}');`
        ];
        const result = await executeQuery(query);

        let notifiedCount = emitToRoomWatchers(socket, roomCode, SIGNALS.WATCHER_LEAVE, { roomCode: data.roomCode });

        if (notifiedCount === 0) {
            const query1 = [
                `UPDATE ${WATCH_ROOM_TABLE}`,
                `SET ${WATCH_ROOM_KEYS.EMPTY_SINCE}=NOW()`,
                `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}');`
            ];
            const result1 = await executeQuery(query1);

            emptyRooms[roomCode] = true; // "true" doesn't actually mean anything, it just inserts a truthy value
        }
    } catch (err) {
        console.error(err);
        socketEmit(socket, SIGNALS.WATCHER_LEAVE, false, {});
    }
}

async function deleteOldRecords() {
    console.log(arguments.callee.name);

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
    console.log(arguments.callee.name);

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

function socketEmit(socket, signal, success, data) {
    socket.emit(`${signal}Response`, {
        success: success,
        signal: signal,
        data: data
    });
}

async function generateRoomCode() {
    console.log(arguments.callee.name);

    try {
        while (true) {
            let roomCode = '';

            for (let i = 0; i < 10; i++) {
                const randomIndex = Math.floor(Math.random() * CHARACTERS.length);
                roomCode += CHARACTERS.charAt(randomIndex);
            }

            const record = getRowFromRoomCode(roomCode);

            if (!record.rows)
                return roomCode;

            console.log(`roomCode ${roomCode} was not unique. Trying again...`);
        }
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function getRowFromRoomCode(roomCode) {
    console.log(arguments.callee.name);

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
    console.log(arguments.callee.name);

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
