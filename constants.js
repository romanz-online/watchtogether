module.exports = {
    WATCH_ROOM_TABLE: 'WatchRoom',
    WATCH_ROOM_USER_TABLE: 'WatchRoomUser',
    WATCH_ROOM_KEYS: {
        ROOM_CODE: 'room_code',
        VIDEO_ID: 'video_id',
        NUM_WATCHERS: 'num_watchers',
        TIMESTAMP: 'timestamp',
        PLAYBACK_RATE: 'playback_rate',
        EMPTY_SINCE: 'empty_since'
    },
    WATCH_ROOM_USER_KEYS: {
        SOCKET_ID: 'socket_id',
        ROOM_CODE: 'room_code',
    },
    CHARACTERS: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    SIGNALS: {
        CONNECTION: 'connection',
        DISCONNECT: 'disconnect',
        WATCHER_JOIN: 'watcherJoin',
        WATCHER_LEAVE: 'watcherLeave',
        LOAD_VIDEO: 'loadVideo',
        PLAY: 'play',
        PAUSE: 'pause',
        PLAYBACK_RATE: 'playbackRate',
        CREATE_WATCH_ROOM: 'createWatchRoom',
        GET_WATCH_ROOM_DATA: 'getWatchRoomData'
    }
};

// CREATE TABLE WatchRoom (
//     id SERIAL PRIMARY KEY,
//     room_code VARCHAR(10) UNIQUE NOT NULL,
//     video_id VARCHAR(50) DEFAULT '',
//     num_watchers INTEGER DEFAULT 0,
//     timestamp DOUBLE PRECISION DEFAULT 0.0,
//     playback_rate DOUBLE PRECISION DEFAULT 1.0,
//     empty_since TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

// CREATE TABLE WatchRoomUser (
//     id SERIAL PRIMARY KEY,
//     socket_id VARCHAR(50) NOT NULL,
//     room_code VARCHAR(10) NOT NULL,
//     FOREIGN KEY (room_code) REFERENCES WatchRoom(room_code)
// );