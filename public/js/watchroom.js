let socket;
let player;
let state;
let playbackRate;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: 'RqooLet7B2Q',
        playerVars: {
            'playsinline': 1,
            // 'autoplay': 1 // DOES NOT WORK ON BRAVE
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onPlaybackRateChange': onPlaybackRateChange
        }
    });
}

function onPlayerReady(event) {
    state = player.getPlayerState();
    playbackRate = player.getPlaybackRate();
}

function onPlaybackRateChange(event) {
    if (playbackRate === player.getPlaybackRate()) {
        return;
    }

    playbackRate = player.getPlaybackRate();
    socket.emit('rate', {
        rate: playbackRate
    });
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        if (state === YT.PlayerState.PLAYING) {
            return;
        }
        state = YT.PlayerState.PLAYING;
        socket.emit('play', {
            timestamp: player.getCurrentTime()
        });
    }

    if (event.data === YT.PlayerState.PAUSED) {
        if (state === YT.PlayerState.PAUSED) {
            return;
        }
        state = YT.PlayerState.PAUSED;
        socket.emit('pause', {
            timestamp: player.getCurrentTime()
        });
    }
}

function getVideoIDFromURL(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*\/|.*v=|.*vi=))([^&?]+)/);
    return (match && match[1]) ? match[1] : null;
}

$(document).ready(function () {
    socket = io();

    socket.on('play', (response) => {
        if (state === YT.PlayerState.PLAYING)
            return;

        const { data } = response;
        const { timestamp } = data;

        player.seekTo(timestamp, true);

        state = YT.PlayerState.PLAYING;
        player.playVideo();
    });

    socket.on('pause', (response) => {
        if (state === YT.PlayerState.PAUSED)
            return;

        const { data } = response;
        const { timestamp } = data;

        player.seekTo(timestamp, true);

        state = YT.PlayerState.PAUSED;
        player.pauseVideo();
    });

    socket.on('rate', (response) => {
        const { data } = response;
        const { rate } = data;

        if (playbackRate === rate)
            return;

        playbackRate = rate;
        player.setPlaybackRate(rate);
    });

    $('#videoLinkInput').on('submit', function () {
        event.preventDefault();
        const inputValue = getVideoIDFromURL($('#videoLink').val());
        if (inputValue) {
            player.loadVideoById(inputValue, 5, 'large');
        }
    });

    $('#createRoom').on('submit', function () {
        socket.emit('createRoom');
    });
});