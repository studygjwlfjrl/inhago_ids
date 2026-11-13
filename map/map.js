
const campus = {
  lat: 37.4505,
  lng: 126.6570
};

// 실제 모임 데이터는 로그인 후 API에서 가져옵니다.
let meetings = [];
let activeMapCategory = 'all';
async function refreshMeetings() {
  try {
    const { getMeetings } = await import('../InhaGo_Design/frontend/js/meetings-api.js');
    const response = await getMeetings();
    meetings = (response.meetings || [])
      .filter(m => Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude)) && m.latitude != null && m.longitude != null)
      .map(m => ({
        id: m.id, title: m.title, category: m.category,
        lat: Number(m.latitude), lng: Number(m.longitude),
        place: m.location_name, time: new Date(m.meeting_time).toLocaleString('ko-KR')
      }));
    if (map) showMarkers(activeMapCategory);
  } catch (error) {
    console.error('지도 모임 조회 실패:', error);
  }
}

const mapIcons = {
  meal: "🍚",
  taxi: "🚕",
  study: "📚",
  exercise: "🏃"
};

let map;
let markers = [];
const status = document.getElementById("status");

// Google 지도 생성
async function initMap() {
  try {
    const { Map } =
      await google.maps.importLibrary("maps");

    const { AdvancedMarkerElement } =
      await google.maps.importLibrary("marker");

    map = new Map(document.getElementById("map"), {
      center: campus,
      zoom: 16,
      mapId: "DEMO_MAP_ID",
      mapTypeControl: false,
      streetViewControl: false
    });

    await refreshMeetings();
    setupButtons();

    // 지도 생성 성공 후 자동 GPS 추적 시작
    if (window.inhaGoLoggedIn === true) {
    startLocationTracking();
    }

  } catch (error) {
    status.textContent = "지도를 불러오지 못했습니다.";
    console.error(error);
  }
}


let myLocationMarker = null;
let locationWatchId = null;
let hasCenteredOnUser = false;
let currentPosition = null;

function startLocationTracking() {
  if (!navigator.geolocation) {
    console.error("이 브라우저는 위치 서비스를 지원하지 않습니다.");
    return;
  }

  // 중복 위치 추적 방지
  if (locationWatchId !== null) return;

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const myPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      currentPosition = myPosition;
      status.textContent = "";

      // 처음 위치를 가져왔을 때 마커 생성
      if (!myLocationMarker) {
        const blueDot = document.createElement("div");

        blueDot.style.width = "18px";
        blueDot.style.height = "18px";
        blueDot.style.backgroundColor = "#4285f4";
        blueDot.style.border = "3px solid white";
        blueDot.style.borderRadius = "50%";
        blueDot.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
        blueDot.style.boxSizing = "border-box";

        myLocationMarker =
          new google.maps.marker.AdvancedMarkerElement({
            position: myPosition,
            map: map,
            title: "내 현재 위치",
            content: blueDot
          });
      } else {
        // 위치가 바뀌면 기존 마커 이동
        myLocationMarker.position = myPosition;
      }

      // 처음 한 번만 내 위치로 지도 이동
      if (!hasCenteredOnUser) {
        map.setCenter(myPosition);
        map.setZoom(17);
        hasCenteredOnUser = true;
      }

      console.log("현재 위치 업데이트:", myPosition);
    },

    (error) => {
      console.error("GPS 오류 코드:", error.code);
      console.error("GPS 오류 메시지:", error.message);

      if (error.code === 1){
        status.textContent = "위치 접근 권한이 거부되었습니다.";
      } else if (error.code === 2) {
        status.textContent = "현재 위치를 확인할 수 없습니다.";
      } else if (error.code === 3) {
        status.textContent = "위치 확인 시간이 초과되었습니다.";
  }
    },

    {
      enableHighAccuracy: false,
      maximumAge: 10000,
      timeout: 30000
    }
  );
}

// 모임 마커 표시
function showMarkers(category) {
  activeMapCategory = category;
  markers.forEach(marker => {
    marker.map = null;
  });

  markers = [];

  meetings
    .filter(item =>
      category === "all" ||
      item.category === category
    )
    .forEach(item => {

      const pin = document.createElement("div");
      pin.textContent = mapIcons[item.category];
      pin.style.cssText = `
        font-size: 25px;
        background: white;
        border-radius: 50%;
        padding: 8px;
        box-shadow: 0 2px 8px #0003;
      `;

      const marker =
        new google.maps.marker.AdvancedMarkerElement({
          map: map,
          position: {
            lat: item.lat,
            lng: item.lng
          },
          content: pin,
          title: item.title,
          gmpClickable: true
        });

      marker.addEventListener("gmp-click", () => {
        openBottomSheet(item);
      });

      markers.push(marker);
    });
}

// 바텀시트 열기
function openBottomSheet(item) {
  document.getElementById("meetingTitle")
    .textContent = item.title;

  document.getElementById("meetingInfo")
    .textContent =
      `장소: ${item.place}\n시간: ${item.time}`;

  document.getElementById("bottomSheet").hidden = false;
}

function getMyLocation() {
  if (currentPosition) {
    map.panTo(currentPosition);
    map.setZoom(17);
  } else {
    status.textContent = "현재 위치를 확인하는 중입니다.";
    startLocationTracking();
  }
}

// 버튼 이벤트
function setupButtons() {
  document.getElementById("locationBtn")
    .addEventListener("click", getMyLocation);

  document.getElementById("closeBtn")
    .addEventListener("click", () => {
      document.getElementById("bottomSheet").hidden = true;
    });

  document.querySelectorAll("#filters [data-category]")
    .forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("#filters [data-category]")
          .forEach(b => b.classList.remove("active"));

        button.classList.add("active");
        showMarkers(button.dataset.category);
      });
    });
}

// Google Maps API 로드
function loadGoogleMaps() {
  const apiKey = window.MAP_CONFIG?.apiKey;

  if (!apiKey) {
    status.textContent = "Google Maps API 키가 필요합니다.";
    return;
  }

  window.initMap = initMap;

  const script = document.createElement("script");
  script.src =
    "https://maps.googleapis.com/maps/api/js" +
    "?key=" + encodeURIComponent(apiKey) +
    "&loading=async&callback=initMap";

  script.async = true;
  script.onerror = () => {
    status.textContent = "Google Maps API 연결에 실패했습니다.";
  };

  document.head.appendChild(script);
}

window.addEventListener("inhaGoMeetingsChanged", refreshMeetings);
window.addEventListener("inhaGoLoginSuccess", () => {
    refreshMeetings();
    if (typeof map !== "undefined" && map) {
        startLocationTracking();
    }
});

loadGoogleMaps();