let socket;
let player;
let state;
let playbackRate;
let code;
let videoID;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: 'RqooLet7B2Q',
        playerVars: {
            'playsinline': 1,
            'autoplay': 0 // DOES NOT WORK ON BRAVE
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
    videoID = getVideoIDFromURL(player.getVideoUrl());
}

function onPlaybackRateChange(event) {
    if (playbackRate === player.getPlaybackRate()) return;

    playbackRate = player.getPlaybackRate();
    socket.emit('rate', {
        code: code,
        rate: playbackRate
    });
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        if (state === YT.PlayerState.PLAYING) return;

        state = YT.PlayerState.PLAYING;
        socket.emit('play', {
            code: code,
            timestamp: player.getCurrentTime()
        });
    }

    if (event.data === YT.PlayerState.PAUSED) {
        if (state === YT.PlayerState.PAUSED) return;

        state = YT.PlayerState.PAUSED;
        socket.emit('pause', {
            code: code,
            timestamp: player.getCurrentTime()
        });
    }
}

function getVideoIDFromURL(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*\/|.*v=|.*vi=))([^&?]+)/);
    return (match && match[1]) ? match[1] : null;
}

function initSocket() {
    socket = io();

    socket.on('loadVideo', (response) => {
        const { success, signature, data } = response;
        console.log(success ? 'SUCCESS' : 'FAIL', signature);
        if (!success) return;

        if (videoID === data.videoID) return;

        videoID = data.videoID;
        player.loadVideoById(videoID, 5, 'large');
    });

    socket.on('play', (response) => {
        if (state === YT.PlayerState.PLAYING) return;

        const { success, signature, data } = response;
        console.log(success ? 'SUCCESS' : 'FAIL', signature);
        if (!success) return;

        player.seekTo(data.timestamp, true);

        state = YT.PlayerState.PLAYING;
        player.playVideo();
    });

    socket.on('pause', (response) => {
        if (state === YT.PlayerState.PAUSED) return;

        const { success, signature, data } = response;
        console.log(success ? 'SUCCESS' : 'FAIL', signature);
        if (!success) return;

        player.seekTo(data.timestamp, true);

        state = YT.PlayerState.PAUSED;
        player.pauseVideo();
    });

    socket.on('rate', (response) => {
        const { success, signature, data } = response;
        console.log(success ? 'SUCCESS' : 'FAIL', signature);
        if (!success) return;

        if (playbackRate === data.rate) return;

        playbackRate = data.rate;
        player.setPlaybackRate(playbackRate);
    });
}

function getCode() {
    return new URLSearchParams(window.location.search).get('code');
}

$(document).ready(function () {
    code = getCode();

    initSocket();

    $('#videoLinkInput').on('submit', function () {
        event.preventDefault();
        const inputValue = getVideoIDFromURL($('#videoLink').val());
        if (inputValue) {
            player.loadVideoById(inputValue, 5, 'large');
            videoID = inputValue;
            socket.emit('loadVideo', {
                code: code,
                videoID: inputValue
            });
        }
    });
});