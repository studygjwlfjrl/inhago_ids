
const campus = {
  lat: 37.4505,
  lng: 126.6570
};

// 테스트용 모임 데이터
const meetings = [
  {
    title: "점심 같이 먹어요",
    category: "meal",
    lat: 37.4508,
    lng: 126.6566,
    place: "학생회관",
    time: "12:30"
  },
  {
    title: "정문 택시팟",
    category: "taxi",
    lat: 37.4498,
    lng: 126.6559,
    place: "인하대 정문",
    time: "18:00"
  },
  {
    title: "알고리즘 스터디",
    category: "study",
    lat: 37.4511,
    lng: 126.6574,
    place: "도서관 부근",
    time: "16:00"
  },
  {
    title: "저녁 러닝",
    category: "exercise",
    lat: 37.4502,
    lng: 126.6581,
    place: "운동장 부근",
    time: "19:00"
  }
];

const icons = {
  meal: "🍚",
  taxi: "🚕",
  study: "📚",
  exercise: "🏃"
};

let map;
let markers = [];
let myLocationMarker;

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

    showMarkers("all");
    setupButtons();

  } catch (error) {
    status.textContent = "지도를 불러오지 못했습니다.";
    console.error(error);
  }
}

// 모임 마커 표시
function showMarkers(category) {
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
      pin.textContent = icons[item.category];
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
          title: item.title
        });

      marker.addListener("click", () => {
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

// GPS 현재 위치
function getMyLocation() {
  if (!navigator.geolocation) {
    status.textContent = "GPS를 지원하지 않는 브라우저입니다.";
    return;
  }

  status.textContent = "위치를 확인하는 중입니다.";

  navigator.geolocation.getCurrentPosition(
    position => {
      const current = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      if (myLocationMarker) {
        myLocationMarker.setMap(null);
      }

      myLocationMarker = new google.maps.Marker({
        map: map,
        position: current,
        title: "현재 위치",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3
        }
      });

      map.panTo(current);
      status.textContent = "";
    },
    error => {
      status.textContent =
        "위치를 확인할 수 없습니다. 위치 권한을 확인하세요.";
      console.error(error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000
    }
  );
}

// 버튼 이벤트
function setupButtons() {
  document.getElementById("locationBtn")
    .addEventListener("click", getMyLocation);

  document.getElementById("closeBtn")
    .addEventListener("click", () => {
      document.getElementById("bottomSheet").hidden = true;
    });

  document.querySelectorAll("[data-category]")
    .forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-category]")
          .forEach(b => b.classList.remove("active"));

        button.classList.add("active");
        showMarkers(button.dataset.category);
      });
    });
}

// Google Maps API 로드
function loadGoogleMaps() {
  const params = new URLSearchParams(location.search);
  const apiKey = params.get("key");

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

loadGoogleMaps();
