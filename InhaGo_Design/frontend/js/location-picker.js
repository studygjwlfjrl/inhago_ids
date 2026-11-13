/* InhaGo map-centered meeting location picker. Uses the Google Maps API already loaded by map/map.js. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const campus = { lat: 37.4505, lng: 126.6570 };
  let pickerMap = null;
  let activeForm = null;
  let selectedCenter = null;

  function setSummary(form) {
    const label = $("selected-meeting-location");
    if (!label) return;
    const lat = form.elements.namedItem("latitude")?.value;
    const lng = form.elements.namedItem("longitude")?.value;
    label.textContent = lat && lng
      ? "📍 지정된 위치: " + Number(lat).toFixed(6) + ", " + Number(lng).toFixed(6)
      : "아직 위치를 지정하지 않았습니다.";
  }

  async function openPicker(form) {
    if (!window.google?.maps?.importLibrary) {
      alert("지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    activeForm = form;
    const dialog = $("location-picker-dialog");
    dialog.showModal();
    try {
      const { Map } = await google.maps.importLibrary("maps");
      if (!dialog.open) return;
      const lat = Number(form.elements.namedItem("latitude")?.value);
      const lng = Number(form.elements.namedItem("longitude")?.value);
      const initial = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
        ? { lat, lng } : campus;
      if (!pickerMap) {
        pickerMap = new Map($("location-picker-map"), {
          center: initial, zoom: 17, mapTypeControl: false,
          streetViewControl: false, fullscreenControl: false,
          restriction: { latLngBounds: { north: 37.463, south: 37.439, east: 126.675, west: 126.639 }, strictBounds: true }
        });
        pickerMap.addListener("idle", () => {
          if (!pickerMap) return;
          const center = pickerMap.getCenter();
          if (!center) return;
          selectedCenter = { lat: center.lat(), lng: center.lng() };
          $("location-picker-coordinates").textContent =
            "선택 위치: " + selectedCenter.lat.toFixed(6) + ", " + selectedCenter.lng.toFixed(6);
        });
      } else {
        pickerMap.setCenter(initial);
      }
      selectedCenter = initial;
    } catch (error) {
      console.error("위치 선택 지도 오류:", error);
      $("location-picker-coordinates").textContent = "위치 선택 지도를 불러오지 못했습니다.";
    }
  }

  function init() {
    const form = $("create-form");
    if (!form || !$("pick-meeting-location")) return;
    $("pick-meeting-location").addEventListener("click", () => openPicker(form));
    $("location-picker-close").addEventListener("click", () => $("location-picker-dialog").close());
    $("location-picker-confirm").addEventListener("click", () => {
      if (!activeForm || !selectedCenter) return;
      activeForm.elements.namedItem("latitude").value = selectedCenter.lat.toFixed(7);
      activeForm.elements.namedItem("longitude").value = selectedCenter.lng.toFixed(7);
      setSummary(activeForm);
      $("location-picker-dialog").close();
      activeForm.elements.namedItem("place")?.focus();
    });
    form.addEventListener("reset", () => {
      setTimeout(() => setSummary(form), 0);
    });
    setSummary(form);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
