/**
 * YouTube RSS Link Collector - content.js (Robust 버전)
 * 아이콘 클릭 시 RSS 주소를 추출하고 복사합니다.
 */

(function () {
    'use strict';

    const LOG_PREFIX = '[RSS-Extension]';

    console.log(`${LOG_PREFIX} 확장 프로그램 활성화됨.`);

    /**
     * 페이지 내 스크립트 태그에서 특정 변수명에 할당된 JSON 데이터를 추출
     */
    function getScriptData(varName) {
        try {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent;
                if (text.includes(`${varName} =`)) {
                    // JSON 객체 부분만 추출 (중괄호 시작부터 끝까지)
                    const regex = new RegExp(`${varName}\\s*=\\s*({.+?});`);
                    const match = text.match(regex);
                    if (match && match[1]) {
                        return JSON.parse(match[1]);
                    }
                }
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} ${varName} 파싱 실패:`, err);
        }
        return null;
    }

    /**
     * 비디오 재생 페이지(/watch) 전용 추출 로직
     */
    function getRssUrlFromVideo() {
        console.log(`${LOG_PREFIX} 비디오 페이지 분석 시작...`);

        // [1순위] DOM에서 직접 추출 (SPA 내비게이션 시에도 실시간 업데이트되는 정보)
        // #owner나 ytd-video-owner-renderer 요소 내의 HTML에서 UC... ID를 검색합니다.
        const ownerSelectors = ['#owner', 'ytd-video-owner-renderer', '#upload-info', '#channel-name', '#subscribe-button'];
        for (const selector of ownerSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                const match = el.outerHTML.match(/UC[a-zA-Z0-9_-]{22}/);
                if (match) {
                    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${match[0]}`;
                    console.log(`${LOG_PREFIX} DOM(${selector})에서 실시간 추출:`, url);
                    return url;
                }
            }
        }

        // [2순위] 공식 플레이어 응답 데이터 (초기 로드 시 fallback 용도)
        const playerResponse = getScriptData('ytInitialPlayerResponse');
        const channelId = playerResponse?.videoDetails?.channelId;
        if (channelId && channelId.startsWith('UC')) {
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            console.log(`${LOG_PREFIX} ytInitialPlayerResponse에서 발견:`, url);
            return url;
        }

        // [3순위] 인포카드 동영상 버튼 링크
        const infoCardLink = document.querySelector('#infocard-videos-button a');
        const infoMatch = infoCardLink?.href?.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
        if (infoMatch) {
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${infoMatch[1]}`;
            console.log(`${LOG_PREFIX} 인포카드 버튼에서 추출:`, url);
            return url;
        }

        // [4순위] 플레이어 내 채널 링크 요소 (엔딩 카드 등)
        const playerChannelLink = document.querySelector('a.ytp-ce-channel-title.ytp-ce-link');
        const playerMatch = playerChannelLink?.href?.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
        if (playerMatch) {
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${playerMatch[1]}`;
            console.log(`${LOG_PREFIX} 플레이어 채널 링크에서 추출:`, url);
            return url;
        }

        return null;
    }

    /**
     * 채널 홈 전용 추출 로직
     */
    function getRssUrlFromHead() {
        console.log(`${LOG_PREFIX} 채널 홈 분석 시작...`);

        // [1순위] 유투브 공식 RSS alternate 태그
        const rssLink = document.querySelector('link[rel="alternate"][type="application/rss+xml"]');
        if (rssLink && rssLink.href.includes('channel_id=UC')) {
            console.log(`${LOG_PREFIX} RSS Alternate 태그에서 발견:`, rssLink.href);
            return rssLink.href;
        }

        // [2순위] 메타 태그 (itemprop="channelId" - 핸들 페이지에서도 존재)
        const channelIdMeta = document.querySelector('meta[itemprop="channelId"]');
        if (channelIdMeta && (channelIdMeta.content || channelIdMeta.getAttribute('content'))) {
            const cid = channelIdMeta.content || channelIdMeta.getAttribute('content');
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
            console.log(`${LOG_PREFIX} 메타 태그(channelId)에서 추출:`, url);
            return url;
        }

        // [3순위] Canonical 주소에서 UC ID 추출
        const canonical = document.querySelector('link[rel="canonical"]')?.href;
        let match = canonical?.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
        if (match) {
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`;
            console.log(`${LOG_PREFIX} Canonical 링크에서 추출:`, url);
            return url;
        }

        // [4순위] Open Graph URL에서 UC ID 추출
        const ogUrl = document.querySelector('meta[property="og:url"]')?.content;
        match = ogUrl?.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
        if (match) {
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`;
            console.log(`${LOG_PREFIX} og:url 태그에서 추출:`, url);
            return url;
        }

        // [5순위] ytInitialData에서 추출
        const data = getScriptData('ytInitialData');
        const cidData = data?.metadata?.channelMetadataRenderer?.externalId;
        if (cidData && cidData.startsWith('UC')) {
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${cidData}`;
            console.log(`${LOG_PREFIX} ytInitialData에서 추출:`, url);
            return url;
        }

        // [6순위] DOM 텍스트 검색 (최후의 수단)
        const bodyMatch = document.body.innerHTML.match(/UC[a-zA-Z0-9_-]{22}/);
        if (bodyMatch) {
            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${bodyMatch[0]}`;
            console.log(`${LOG_PREFIX} DOM 텍스트 검색에서 추출:`, url);
            return url;
        }

        return null;
    }

    /**
     * Toast 메시지 표시
     */
    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 50px;
            left: 50%;
            transform: translateX(-50%);
            background-color: ${isError ? '#f44336' : '#323232'};
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            z-index: 10000;
            font-family: Roboto, Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: opacity 0.3s;
            pointer-events: none;
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 복사 실행 프로세스 (사용자 제안 로직 적용)
     */
    async function executeCopy() {
        // [사용자 요청] 데이터를 null로 초기화 후 시작
        let targetRssUrl = null;
        const path = location.pathname;

        if (path.includes('/watch')) {
            // [비디오 재생 페이지] 추출
            targetRssUrl = getRssUrlFromVideo();
        } else {
            // [채널 홈 등] 추출
            targetRssUrl = getRssUrlFromHead();
        }

        // [사용자 요청] null인 경우 에러 메시지 표시
        if (!targetRssUrl) {
            console.warn(`${LOG_PREFIX} RSS 주소 생성 불가 (정보를 찾지 못함)`);
            showToast('채널 정보를 찾을 수 없습니다. 채널 페이지인지 확인해 주세요.', true);
            return;
        }

        try {
            // [중요] 아이콘 클릭 시 포커스가 툴바로 이동하므로, 문서로 포커스를 강제 이동시켜야 복사가 허용됨
            window.focus();

            await navigator.clipboard.writeText(targetRssUrl);
            console.log(`${LOG_PREFIX} 복사 성공:`, targetRssUrl);
            showToast('RSS 주소를 클립보드에 복사했습니다!');
        } catch (err) {
            console.error(`${LOG_PREFIX} 복사 실패:`, err);
            showToast('클립보드 복사에 실패했습니다.', true);
        }
    }

    /**
     * 배경 스크립트로부터의 메시지 리스너
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log(`${LOG_PREFIX} 메시지 수신:`, request.action);
        if (request.action === 'copy_rss') {
            executeCopy();
            sendResponse({ status: 'success' });
        }
    });

})();
