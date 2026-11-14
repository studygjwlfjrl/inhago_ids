
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
        id: m.id, title: m.title, category: m.category === "food" ? "meal" : m.category,
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

    map = new Map(document.getElementById("map"), {
      center: campus,
      zoom: 16,
      mapId: "DEMO_MAP_ID",
      mapTypeControl: false,
      streetViewControl: false
    });

    setupButtons();
    // 모임 API 지연/실패가 위치 버튼 및 GPS 시작을 막지 않도록 비동기 실행
    void refreshMeetings();

    // 로그인과 무관하게 위치 권한 요청 및 현재 위치 표시
    startLocationTracking();

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
    status.textContent = "이 브라우저는 위치 서비스를 지원하지 않습니다.";
    console.error(status.textContent);
    return;
  }

  if (!window.isSecureContext) {
    status.textContent = "위치 확인에는 HTTPS 연결이 필요합니다.";
    return;
  }

  // 중복 위치 추적 방지
  if (locationWatchId !== null) return;
  status.textContent = "현재 위치를 확인하는 중입니다.";

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
        myLocationMarker = new google.maps.Marker({
          position: myPosition,
          map,
          title: "내 현재 위치",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: "#4285f4",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3
          }
        });
      } else {
        // 위치가 바뀌면 기존 마커 이동
        myLocationMarker.setPosition(myPosition);
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
      locationWatchId = null;
      console.error("GPS 오류 코드:", error.code);
      console.error("GPS 오류 메시지:", error.message);

      if (error.code === 1){
        status.textContent = "위치 접근 권한이 거부되었습니다.";
      } else if (error.code === 2) {
        status.textContent = "현재 위치를 확인할 수 없습니다.";
      } else if (error.code === 3) {
        status.textContent = "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.";
      } else {
        status.textContent = "위치 확인에 실패했습니다.";
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

      // 기본 Marker 사용: 일부 Safari/Maps 조합에서 AdvancedMarkerElement의
      // gmpClickable 초기화가 내부 오류(b.keys)를 발생시키는 문제 회피.
      const marker = new google.maps.Marker({
        map,
        position: { lat: item.lat, lng: item.lng },
        title: item.title,
        label: {
          text: mapIcons[item.category] || "📍",
          fontSize: "22px"
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 22,
          fillColor: "#ffffff",
          fillOpacity: 1,
          strokeColor: "#d6e5f5",
          strokeWeight: 2
        }
      });

      marker.addListener("click", () => openBottomSheet(item));

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


  document.getElementById("closeBtn")
    ?.addEventListener("click", () => {
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

// 상단 카테고리 선택도 지도 마커 필터와 연동
const topCategories = document.querySelectorAll(".category-chip[data-category]");
topCategories.forEach(button => button.addEventListener("click", () => {
  const category = button.dataset.category === "food" ? "meal" : button.dataset.category;
  topCategories.forEach(chip => chip.classList.toggle("active", chip === button));
  document.querySelectorAll("#filters [data-category]").forEach(filter =>
    filter.classList.toggle("active", filter.dataset.category === category));
  if (map) showMarkers(category);
}));
window.addEventListener("inhaGoLoginSuccess", () => {
    refreshMeetings();
    if (typeof map !== "undefined" && map) {
        startLocationTracking();
    }
});

loadGoogleMaps();