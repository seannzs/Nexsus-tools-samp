// ================= TAB NAVIGATION =================
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${tabId}`).classList.add('active');

    const activeContainer = document.querySelector('.container.active');
    if (activeContainer) {
        gsap.to(activeContainer, {
            opacity: 0, y: 10, scale: 0.98, duration: 0.18,
            ease: "power2.in",
            onComplete: () => {
                activeContainer.classList.remove('active');
                activeContainer.style.display = 'none';
                showTargetTab(tabId);
            }
        });
    } else {
        showTargetTab(tabId);
    }
}

function showTargetTab(tabId) {
    const nextContainer = document.getElementById(`tab-${tabId}`);
    nextContainer.style.display = 'block';
    nextContainer.classList.add('active');

    gsap.fromTo(nextContainer,
        { opacity: 0, y: 20, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" }
    );

    // Stagger animate children
    const staggerItems = nextContainer.querySelectorAll('.form-group, .header-zone, .btn, .canvas-container, .menu-card, .home-hero');
    gsap.fromTo(staggerItems,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.25, stagger: 0.06, ease: "power2.out", delay: 0.1 }
    );

    if (tabId === 'ssrp-gen') drawSsrp();
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div>${type === 'success' ? '⚡' : '⚠️'}</div><div>${message}</div>`;
    container.appendChild(toast);
    gsap.fromTo(toast,
        { x: '120%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 0.35, ease: "back.out(1.4)" }
    );
    setTimeout(() => {
        gsap.to(toast, { opacity: 0, x: 30, duration: 0.25, onComplete: () => toast.remove() });
    }, 3500);
}

// Ripple effect on button click
function addRipple(btn, e) {
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

// ================= LOADING PHASES =================
const CS_PHASES = [
    "Menginisialisasi AI Engine...",
    "Menganalisis data karakter...",
    "Menyusun latar belakang cerita...",
    "Menulis paragraf pertama...",
    "Menulis paragraf kedua...",
    "Menulis paragraf ketiga...",
    "Finalisasi & formatting cerita..."
];

let phaseInterval = null;
let progressAnim = null;

function startLoadingPhases() {
    const phaseEl = document.getElementById('loadingPhase');
    const progressBar = document.getElementById('loadingProgressBar');
    let phaseIndex = 0;
    let progress = 0;

    phaseEl.textContent = CS_PHASES[0];
    progressBar.style.width = '0%';

    // Animate progress bar pseudo-realistically
    progressAnim = gsap.to({ val: 0 }, {
        val: 88,
        duration: 12,
        ease: "power1.inOut",
        onUpdate: function () {
            progressBar.style.width = this.targets()[0].val + '%';
        }
    });

    phaseInterval = setInterval(() => {
        phaseIndex = (phaseIndex + 1) % CS_PHASES.length;
        gsap.fromTo(phaseEl,
            { opacity: 0, y: 5 },
            { opacity: 1, y: 0, duration: 0.3, ease: "power2.out",
              onStart: () => { phaseEl.textContent = CS_PHASES[phaseIndex]; }
            }
        );
    }, 1800);
}

function stopLoadingPhases(success) {
    clearInterval(phaseInterval);
    if (progressAnim) progressAnim.kill();
    const progressBar = document.getElementById('loadingProgressBar');
    const phaseEl = document.getElementById('loadingPhase');

    if (success) {
        gsap.to({ val: parseFloat(progressBar.style.width) || 88 }, {
            val: 100, duration: 0.4, ease: "power2.out",
            onUpdate: function () { progressBar.style.width = this.targets()[0].val + '%'; }
        });
        gsap.fromTo(phaseEl,
            { opacity: 0, y: 4 },
            { opacity: 1, y: 0, duration: 0.3, onStart: () => { phaseEl.textContent = "Cerita selesai dibuat! ✓"; }}
        );
    }
}

// ================= TYPEWRITER REVEAL =================
function typewriterReveal(elementId, text, speed = 8) {
    const el = document.getElementById(elementId);
    el.textContent = '';
    let i = 0;
    // Use chunked writes for performance on long text
    const chunkSize = 3;
    function writeChunk() {
        if (i < text.length) {
            el.textContent += text.slice(i, i + chunkSize);
            i += chunkSize;
            // Auto-scroll preview box
            el.parentElement.scrollTop = el.parentElement.scrollHeight;
            setTimeout(writeChunk, speed);
        } else {
            el.textContent = text; // Ensure exact final output
        }
    }
    writeChunk();
}

// ================= CHARACTER STORY ENGINE =================
async function generateStoryWithAnim() {
    const fullName = document.getElementById('charName').value.trim();
    const place = document.getElementById('birthPlace').value.trim();
    const dateInput = document.getElementById('birthDate').value;
    const infoTambahan = document.getElementById('promptTambahan').value.trim();

    if (!fullName || !place || !dateInput) {
        // Shake the form
        const grid = document.querySelector('#tab-cs-gen .form-grid');
        gsap.fromTo(grid, { x: -8 }, { x: 0, duration: 0.4, ease: "elastic.out(1, 0.3)" });
        showNotification("Mohon isi semua data wajib!", "error");
        return;
    }

    const dateObj = new Date(dateInput);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const formatCSDate = `${day}/${month}/${year}`;

    const btn = document.getElementById('btnGenCS');
    const loadingArea = document.getElementById('loadingAreaCS');
    const outputContainer = document.getElementById('outputContainerCS');

    // Animate button collapse → loading
    btn.disabled = true;
    btn.classList.add('btn-loading');
    gsap.to(btn, { scale: 0.97, duration: 0.1, yoyo: true, repeat: 1 });

    outputContainer.style.display = 'none';
    outputContainer.style.opacity = '0';

    await new Promise(r => setTimeout(r, 150));
    loadingArea.style.display = 'block';
    gsap.fromTo(loadingArea, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
    startLoadingPhases();

    const promptAI = `Kamu adalah AI pembuat Character Story profesional. Karakter ini bernama ${fullName.replace('_', ' ')} yang lahir di ${place} pada tanggal ${day}/${month}/${year}. Detail latar belakang tambahan: ${infoTambahan || 'tidak ada'}. Dilarang merespon dalam bentuk struktur objek JSON, keluarkan langsung teks ceritanya saja secara polos tanpa markdown tebal. rules 
[•] Umur karakter setidaknya berusia 18 tahun secara IC
[•] Diawal story wajib memiliki tanggal lahir karakter anda.
[•] Menggunakan Bahasa Indonesia/Inggris yang baik dan benar sesuai dengan kaidah kepenulisan.
[•] Menggunakan sudut pandang pihak ketiga, contoh: Ia, Dia, Jhonson, Alexie, Steven
[•] Menggunakan tanda baca yang tepat serta menggunakan kalimat yang dapat dimengerti.
[•] Character Story minimal memiliki 4 paragraf dan masing-masing memiliki 4 baris.
[•] Minimal mempunyai 230-300 kata
[•] Beri satu baris kosong untuk memisahkan paragraf satu dengan lainnya.
[•] Tidak memasukkan dialog dalam cerita karakter.
[•] Penulisan Nama di dalam cerita tidak boleh menggunakan tanda (_), agar terlihat rapih.
[•] Akhiri setiap paragraf dengan tanda baca (.), Karna banyaknya baris per paragraf dihitung dari kalimat yang diakhiri tanda baca (.).
[•] Untuk TIME SKIP Itu kami tidak melarang adanya penggunaan TIME SKIP dalam cerita, namun Jangan terlalu jauh TIME SKIP Kalian di cerita, karna itu akan berpengaruh terhadap alur cerita kalian juga, sebab banyak peristiwa peristiwa yang ter Skip.[•] Umur karakter setidaknya berusia 18 tahun secara IC
[•] Diawal story wajib memiliki tanggal lahir karakter anda.
[•] Menggunakan Bahasa Indonesia/Inggris yang baik dan benar sesuai dengan kaidah kepenulisan.
[•] Menggunakan sudut pandang pihak ketiga, contoh: Ia, Dia, Jhonson, Alexie, Steven
[•] Menggunakan tanda baca yang tepat serta menggunakan kalimat yang dapat dimengerti.
[•] Character Story minimal memiliki 4 paragraf dan masing-masing memiliki 4 baris.
[•] Minimal mempunyai 230-300 kata
[•] Beri satu baris kosong untuk memisahkan paragraf satu dengan lainnya.
[•] Tidak memasukkan dialog dalam cerita karakter.
[•] Penulisan Nama di dalam cerita tidak boleh menggunakan tanda (_), agar terlihat rapih.
[•] Akhiri setiap paragraf dengan tanda baca (.), Karna banyaknya baris per paragraf dihitung dari kalimat yang diakhiri tanda baca (.).
[•] Untuk TIME SKIP Itu kami tidak melarang adanya penggunaan TIME SKIP dalam cerita, namun Jangan terlalu jauh TIME SKIP Kalian di cerita, karna itu akan berpengaruh terhadap alur cerita kalian juga, sebab banyak peristiwa peristiwa yang ter Skip.`;

    try {
        const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(promptAI)}?model=openai&system=${encodeURIComponent("Keluarkan respon dalam bentuk teks cerita langsung murni bahasa indonesia, dilarang membungkus dengan JSON.")}`);
        if (!response.ok) throw new Error("Koneksi API Gagal.");

        let rawData = await response.text();
        let cleanedStory = rawData.replace(/^["'`]|["'`]$/g, '').trim();
        const finalOutput = `Character: ${fullName}\nOrigin: ${place}\nStory Character Born: ${formatCSDate}\n\n${cleanedStory}`;

        stopLoadingPhases(true);

        await new Promise(r => setTimeout(r, 500));

        // Animate loading out
        gsap.to(loadingArea, {
            opacity: 0, y: -8, duration: 0.25, ease: "power2.in",
            onComplete: () => {
                loadingArea.style.display = 'none';

                // Reveal output with glow burst — no child stagger to avoid opacity lock
                outputContainer.style.display = 'block';
                outputContainer.style.opacity = '1';
                gsap.fromTo(outputContainer,
                    { opacity: 0, y: 16, scale: 0.97 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out",
                      clearProps: "transform,scale" }
                );

                // Typewriter the text
                typewriterReveal('outputCS', finalOutput, 6);

                // Glow pulse on preview box
                const box = document.querySelector('.preview-box');
                gsap.fromTo(box,
                    { boxShadow: '0 0 0px rgba(0,255,240,0)' },
                    { boxShadow: '0 0 24px rgba(0,255,240,0.18)', duration: 0.5, yoyo: true, repeat: 1 }
                );

                showNotification("Character Story sukses dibuat!", "success");
            }
        });

    } catch (error) {
        stopLoadingPhases(false);
        gsap.to(loadingArea, { opacity: 0, duration: 0.2, onComplete: () => { loadingArea.style.display = 'none'; }});
        showNotification("Error: " + error.message, "error");
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        gsap.to(btn, { scale: 1, duration: 0.2 });
    }
}

// ================= EXPORT .TXT =================
function exportTxt() {
    try {
        const el = document.getElementById('outputCS');
        // Force element visible before reading (GSAP might have left opacity inline)
        el.style.opacity = '1';
        el.closest('.output-container').style.opacity = '1';

        const text = (el.textContent || el.innerText || '').trim();
        if (!text) {
            showNotification("Belum ada cerita untuk diekspor!", "error");
            return;
        }
        const charName = (document.getElementById('charName').value || 'character').trim().replace(/\s+/g, '_');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CS_${charName}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification("File .TXT berhasil diunduh!", "success");
    } catch (err) {
        showNotification("Gagal ekspor: " + err.message, "error");
    }
}

// ================= SSRP CANVAS ENGINE =================
const canvas = document.getElementById('ssrpCanvas');
const ctx = canvas.getContext('2d');

let loadedImg = null;
let textX = 40;
let textY = 60;
let selectedColor = '#ffffff';

function loadSsrpImage(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            loadedImg = img;
            canvas.width = img.width;
            canvas.height = img.height;
            textX = Math.round(img.width * 0.03);
            textY = Math.round(img.height * 0.06);
            drawSsrp();

            // Animate canvas container in
            const cc = document.querySelector('.canvas-container');
            gsap.fromTo(cc,
                { opacity: 0.5, scale: 0.98 },
                { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" }
            );
            showNotification("Gambar berhasil dimuat!", "success");
        }
        img.src = event.target.result;
    }
    if (e.target.files[0]) reader.readAsDataURL(e.target.files[0]);
}

function setSsrpColor(color, element) {
    selectedColor = color;
    document.querySelectorAll('.color-dot').forEach(dot => dot.classList.remove('active'));
    element.classList.add('active');
    gsap.fromTo(element, { scale: 1.3 }, { scale: 1.15, duration: 0.2, ease: "elastic.out(1, 0.5)" });
    drawSsrp();
}

function moveText(direction) {
    const speed = 12;
    if (direction === 'up') textY -= speed;
    if (direction === 'down') textY += speed;
    if (direction === 'left') textX -= speed;
    if (direction === 'right') textX += speed;
    drawSsrp();
}

function drawSsrp() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (loadedImg) {
        ctx.drawImage(loadedImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#0c101f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0, 255, 240, 0.4)";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Silakan Lampirkan Screenshot Polosan Terlebih Dahulu", canvas.width / 2, canvas.height / 2);
        return;
    }

    const textValue = document.getElementById('ssrpText').value || "";
    const size = document.getElementById('ssrpFontSize').value || 26;

    ctx.font = `bold ${size}px Arial, Tahoma`;
    ctx.textAlign = "left";

    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(textValue, textX, textY);

    ctx.fillStyle = selectedColor;
    ctx.fillText(textValue, textX, textY);
}

function downloadSsrpImg() {
    if (!loadedImg) {
        showNotification("Unggah gambar terlebih dahulu!", "error");
        return;
    }
    const btn = document.querySelector('#tab-ssrp-gen .btn-generate');
    gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.3, ease: "elastic.out(1, 0.4)" });

    const link = document.createElement('a');
    link.download = 'nexus_ssrp_export.png';
    link.href = canvas.toDataURL();
    link.click();
    showNotification("Gambar SSRP siap pakai tersimpan!", "success");
}

function copyText(elementId) {
    const el = document.getElementById(elementId);
    navigator.clipboard.writeText(el.innerText).then(() => {
        showNotification("Berhasil disalin!", "success");
    }).catch(() => {
        showNotification("Gagal menyalin teks.", "error");
    });
}

// ================= BUTTON RIPPLE INIT =================
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn, .btn-ctrl, .tab-btn');
    if (btn && !btn.disabled) addRipple(btn, e);
});
