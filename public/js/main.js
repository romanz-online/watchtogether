let socket;
let player;
let state;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: 'RqooLet7B2Q',
        playerVars: {
            'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log('onPlayerReady');
    state = YT.PlayerState.PAUSED;
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        state = YT.PlayerState.PLAYING;
        socket.emit('play', {
            timestamp: player.getCurrentTime()
        });
    }

    if (event.data === YT.PlayerState.PAUSED) {
        state = YT.PlayerState.PAUSED;
        socket.emit('pause', {
            timestamp: player.getCurrentTime()
        });
    }
}

$(document).ready(function () {
    socket = io();

    socket.on('play', (response) => {
        if (state === YT.PlayerState.PLAYING)
            return;

        const { data } = response;
        const { timestamp } = data;

        player.seekTo(timestamp, true);

        player.playVideo();
    });

    socket.on('pause', (response) => {
        if (state === YT.PlayerState.PAUSED)
            return;

        const { data } = response;
        const { timestamp } = data;

        player.seekTo(timestamp, true);

        player.pauseVideo();
    });
});