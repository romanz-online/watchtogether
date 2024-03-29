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

let SIMULATOR = false;

const dbConfig = process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
} : {
    user: 'postgres',
    host: 'localhost',
    database: 'watchtogether',
    // database: 'NONEXISTENT DATABASE',
    password: 'admin',
    port: 5432,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
};
const pool = new Pool(dbConfig);
pool.connect() // testing connection
    .then(() => {
        console.log('Connected to the database');
        console.log('SIMULATOR mode is off');
    })
    .catch(err => {
        console.error('Error connecting to the database:', err);
        console.log('Enabling SIMULATOR mode');
        SIMULATOR = true;
    });

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

const eventMap = {
    [SIGNALS.WATCHER_JOIN]: watcherJoin,
    [SIGNALS.WATCHER_LEAVE]: watcherLeave,
    [SIGNALS.LOAD_VIDEO]: loadVideo,
    [SIGNALS.PLAY]: play,
    [SIGNALS.PAUSE]: pause,
    [SIGNALS.PLAYBACK_RATE]: playbackRate,
    [SIGNALS.SYNC_TIMESTAMP]: syncTimestamp,
    [SIGNALS.CREATE_WATCH_ROOM]: createWatchRoom,
    [SIGNALS.GET_WATCH_ROOM_DATA]: getWatchRoomData,
    [SIGNALS.DRAW]: draw
};

cron.schedule('* * * * *', () => { deleteEmptyRecords(); }); // every 1 minute

const asURL = (f) => `${__dirname}/public/${f}`;

app.get('/watchroom', (req, res) => {
    console.log('/watchroom');

    const roomCode = req.query.roomCode;

    res.sendFile(asURL((roomCode && roomCode.length === 10) ? 'watchroom.html' : 'index.html'));
});

io.on(SIGNALS.CONNECTION, (socket) => {
    connectedClients[socket.id] = socket;

    socket.on(SIGNALS.DISCONNECT, () => {
        delete connectedClients[socket.id];
    });

    Object.entries(eventMap).forEach(([signal, handler]) => {
        socket.on(signal, data => handler(socket, data));
    });
});

async function createWatchRoom(socket) {
    const responseSignal = SIGNALS.CREATE_WATCH_ROOM;
    console.log(arguments.callee.name);

    try {
        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: '1234567890'
            });
            return;
        }

        const newRoomCode = await generateRoomCode();

        const query = [
            `INSERT INTO ${WATCH_ROOM_TABLE}`,
            `(${WATCH_ROOM_KEYS.ROOM_CODE})`,
            `VALUES ('${newRoomCode}');`
        ];
        const result = await executeQuery(query);

        socketEmit(socket, responseSignal, true, {
            roomCode: newRoomCode
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function getWatchRoomData(socket, data) {
    const responseSignal = SIGNALS.GET_WATCH_ROOM_DATA;
    console.log(arguments.callee.name);

    try {
        const { roomCode } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: roomCode,
                videoID: 'Rz9Hokt6Jx4',
                numWatchers: 1,
                timestamp: 0.00,
                playbackRate: 1,
                drawData: ''
            });
            return;
        }

        const record = await getRowFromRoomCode(roomCode);

        socketEmit(socket, responseSignal, true, {
            roomCode: roomCode,
            videoID: record[WATCH_ROOM_KEYS.VIDEO_ID],
            numWatchers: record[WATCH_ROOM_KEYS.NUM_WATCHERS] + 1,
            timestamp: record[WATCH_ROOM_KEYS.TIMESTAMP],
            playbackRate: record[WATCH_ROOM_KEYS.PLAYBACK_RATE],
            drawData: record[WATCH_ROOM_KEYS.DRAW_DATA]
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function watcherJoin(socket, data) {
    const responseSignal = SIGNALS.WATCHER_JOIN;
    console.log(arguments.callee.name);

    try {
        const { roomCode } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: '1234567890',
                numWatchers: 1
            });
            return;
        }

        const query = [
            `INSERT INTO ${WATCH_ROOM_USER_TABLE}`,
            `(${WATCH_ROOM_USER_KEYS.ROOM_CODE}, ${WATCH_ROOM_USER_KEYS.SOCKET_ID})`,
            `VALUES ('${roomCode}', '${socket.id}');`
        ];
        const result = await executeQuery(query);

        const usersList = await getUsersFromRoomCode(roomCode);
        const newNumWatchers = usersList.length;

        const query1 = [
            `UPDATE ${WATCH_ROOM_TABLE}`,
            `SET ${WATCH_ROOM_KEYS.NUM_WATCHERS}=${newNumWatchers}`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result1 = await executeQuery(query1);

        if (emptyRooms[roomCode])
            delete emptyRooms[roomCode];

        emitToRoomWatchers(socket, roomCode, responseSignal, {
            roomCode: roomCode,
            numWatchers: newNumWatchers
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function watcherLeave(socket, data) {
    const responseSignal = SIGNALS.WATCHER_LEAVE;
    console.log(arguments.callee.name);

    try {
        const { roomCode } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: '1234567890',
                numWatchers: -1
            });
            return;
        }

        const query = [
            `DELETE FROM ${WATCH_ROOM_USER_TABLE}`,
            `WHERE ${WATCH_ROOM_USER_KEYS.ROOM_CODE}='${roomCode}'`,
            `AND ${WATCH_ROOM_USER_KEYS.SOCKET_ID}='${socket.id}';`
        ];
        const result = await executeQuery(query);

        const usersList = await getUsersFromRoomCode(roomCode);
        const newNumWatchers = usersList.length;

        const query1 = [
            `UPDATE ${WATCH_ROOM_TABLE}`,
            `SET ${WATCH_ROOM_KEYS.NUM_WATCHERS}=${newNumWatchers}`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result1 = await executeQuery(query1);

        if (newNumWatchers === 0) {
            const query2 = [
                `UPDATE ${WATCH_ROOM_TABLE}`,
                `SET ${WATCH_ROOM_KEYS.EMPTY_SINCE}=NOW()`,
                `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
            ];
            const result2 = await executeQuery(query2);

            emptyRooms[roomCode] = true; // "true" doesn't actually mean anything, it's just a truthy value
        } else {
            emitToRoomWatchers(socket, roomCode, responseSignal,
                {
                    roomCode: roomCode,
                    numWatchers: newNumWatchers
                });
        }
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function draw(socket, data) {
    const responseSignal = SIGNALS.DRAW;
    console.log(arguments.callee.name);

    try {
        if (SIMULATOR) {
            // socketEmit(socket, responseSignal, true, {
            //     roomCode: '1234567890',
            //     timestamp: timestamp
            // });
            return;
        }

        const query = [
            `UPDATE ${WATCH_ROOM_TABLE}`,
            `SET ${WATCH_ROOM_KEYS.DRAW_DATA}='${data.drawData}'`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${data.roomCode}';`
        ];
        const result = await executeQuery(query);

        emitToRoomWatchers(socket, data.roomCode, responseSignal, data);
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function syncTimestamp(socket, data) {
    const responseSignal = SIGNALS.SYNC_TIMESTAMP;
    console.log(arguments.callee.name);

    try {
        const { roomCode, timestamp } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: data.roomCode,
                timestamp: data.timestamp
            });
            return;
        }

        const record = await getRowFromRoomCode(roomCode);

        socketEmit(socket, responseSignal, true, {
            roomCode: roomCode,
            timestamp: null // fill in
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function loadVideo(socket, data) {
    const responseSignal = SIGNALS.LOAD_VIDEO;
    console.log(arguments.callee.name);

    try {
        const { roomCode, videoID } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: '1234567890',
                videoID: data.videoID
            });
            return;
        }

        const query = [
            `UPDATE ${WATCH_ROOM_TABLE}`,
            `SET ${WATCH_ROOM_KEYS.VIDEO_ID}='${videoID}'`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result = await executeQuery(query);

        emitToRoomWatchers(socket, roomCode, responseSignal, {
            roomCode: roomCode,
            videoID: videoID
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function play(socket, data) {
    const responseSignal = SIGNALS.PLAY;
    console.log(arguments.callee.name);

    try {
        const { roomCode, timestamp } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: '1234567890',
                timestamp: timestamp
            });
            return;
        }

        const query = [
            `UPDATE ${WATCH_ROOM_TABLE}`,
            `SET ${WATCH_ROOM_KEYS.TIMESTAMP}=${timestamp}`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result = await executeQuery(query);

        emitToRoomWatchers(socket, roomCode, responseSignal, {
            roomCode: roomCode,
            timestamp: timestamp
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function pause(socket, data) {
    const responseSignal = SIGNALS.PAUSE;
    console.log(arguments.callee.name);

    try {
        const { roomCode, timestamp } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: '1234567890',
                timestamp: timestamp
            });
            return;
        }

        const query = [
            `UPDATE ${WATCH_ROOM_TABLE}`,
            `SET ${WATCH_ROOM_KEYS.TIMESTAMP}=${timestamp}`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result = await executeQuery(query);

        emitToRoomWatchers(socket, roomCode, responseSignal, {
            roomCode: roomCode,
            timestamp: timestamp
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function playbackRate(socket, data) {
    const responseSignal = SIGNALS.PLAYBACK_RATE;
    console.log(arguments.callee.name);

    try {
        const { roomCode, playbackRate } = data;

        if (SIMULATOR) {
            socketEmit(socket, responseSignal, true, {
                roomCode: '1234567890',
                playbackRate: playbackRate
            });
            return;
        }

        const query = [
            `UPDATE ${WATCH_ROOM_TABLE}`,
            `SET ${WATCH_ROOM_KEYS.PLAYBACK_RATE}=${playbackRate}`,
            `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
        ];
        const result = await executeQuery(query);

        emitToRoomWatchers(socket, roomCode, responseSignal, {
            roomCode: roomCode,
            playbackRate: playbackRate
        });
    } catch (err) {
        console.error(err);
        socketEmit(socket, responseSignal, false, {});
    }
}

async function deleteEmptyRecords() {
    console.log(arguments.callee.name);

    if (SIMULATOR) return;

    try {
        let roomsToDelete = [];
        for (const roomCode in emptyRooms) {
            if (!emptyRooms.hasOwnProperty(roomCode)) continue;

            const query = [
                `SELECT COUNT(*) FROM ${WATCH_ROOM_TABLE}`,
                `WHERE ${WATCH_ROOM_KEYS.EMPTY_SINCE}<=NOW() - INTERVAL '5 minutes'`,
                `AND ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
            ];
            const result = await executeQuery(query);

            if (result[0].count === 0) continue;

            const query1 = [
                `DELETE FROM ${WATCH_ROOM_USER_TABLE}`,
                `WHERE ${WATCH_ROOM_USER_KEYS.ROOM_CODE}='${roomCode}';`
            ];
            const result1 = await executeQuery(query1);

            const query2 = [
                `DELETE FROM ${WATCH_ROOM_TABLE}`,
                `WHERE ${WATCH_ROOM_KEYS.ROOM_CODE}='${roomCode}';`
            ];
            const result2 = await executeQuery(query2);

            roomsToDelete.push(roomCode);
        }

        if (roomsToDelete.length === 0) {
            console.log('no rooms to delete');
        }

        for (const roomCode of roomsToDelete) {
            delete emptyRooms[roomCode];
        }
    } catch (err) {
        console.error(err);
    }
}



// HELPER METHODS

async function emitToRoomWatchers(socket, roomCode, signal, data) {
    console.log('\t', arguments.callee.name);

    try {
        const result = await getUsersFromRoomCode(roomCode);
        for (const row of result) {
            const socket_id = row[WATCH_ROOM_USER_KEYS.SOCKET_ID];
            if (socket_id !== socket.id && connectedClients[socket_id]) {
                socketEmit(connectedClients[socket_id], signal, true, data);
            }
        }
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
    console.log('\t', arguments.callee.name);

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

            console.log('\t', `roomCode ${roomCode} was not unique. Trying again...`);
        }
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function getRowFromRoomCode(roomCode) {
    console.log('\t', arguments.callee.name);

    try {
        const query = [
            `SELECT * FROM ${WATCH_ROOM_TABLE}`,
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
    console.log('\t', arguments.callee.name);

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
    console.log('\t', queryString.length > 100 ? `${queryString.substring(0, 100)}...` : queryString);


    const client = await pool.connect();
    const { rows } = await client.query(queryString);
    client.release();
    return rows;
}

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => { console.log(`Server is running at http://localhost:${PORT}`); });
