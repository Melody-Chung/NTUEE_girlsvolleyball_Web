// ==========================================
// 1. Initialization and Layout Navigation
// ==========================================

let sidebarHintTimer = null;
const LAST_SECTION_KEY = 'vbt_last_section';
const SIDEBAR_TOGGLED_KEY = 'vbt_sidebar_toggled';

document.addEventListener('DOMContentLoaded', () => {
    // 1. 取得目前的權限狀態
    const savedUsername = localStorage.getItem('vbt_username');
    const savedRole = localStorage.getItem('vbt_role');

    // 2. 執行權限 UI 刷新 (確保 Guest, Member, Captain 看到的都不一樣)
    refreshUIByRole(savedRole);
    applySavedSidebarState();

    // 3. 預設顯示首頁
    showSection(getInitialSection(savedRole));

    // 4. 如果有存檔的資訊，更新使用者名稱等 UI
    if (savedUsername && savedRole) {
        applyLoginUI(savedUsername, savedRole);
    } else {
        window.setTimeout(showSidebarToggleHint, 500);
    }
});

// 🌟 核心函數：根據角色決定誰該出現、誰該消失
function refreshUIByRole(role) {
    const authItems = document.querySelectorAll('.auth-only');
    const captainItems = document.querySelectorAll('.captain-only');

    // 如果是 Captain，兩者都要開
    if (role === 'captain') {
        authItems.forEach(el => el.style.setProperty('display', 'flex', 'important'));
        captainItems.forEach(el => el.style.setProperty('display', 'flex', 'important'));
    } 
    // 如果是 Member，只開 auth，關掉 captain
    else if (role === 'member') {
        authItems.forEach(el => el.style.setProperty('display', 'flex', 'important'));
        captainItems.forEach(el => el.style.setProperty('display', 'none', 'important'));
    } 
    // 訪客模式，全部關掉
    else {
        authItems.forEach(el => el.style.setProperty('display', 'none', 'important'));
        captainItems.forEach(el => el.style.setProperty('display', 'none', 'important'));
    }
}

function toggleSidebar() {
    const mainApp = document.getElementById('main-app');
    mainApp.classList.toggle('sidebar-toggled');
    localStorage.setItem(SIDEBAR_TOGGLED_KEY, String(mainApp.classList.contains('sidebar-toggled')));
    hideSidebarToggleHint();
    updateShowcaseCropGuide();
}

function applySavedSidebarState() {
    const mainApp = document.getElementById('main-app');
    if (!mainApp) return;
    const savedValue = localStorage.getItem(SIDEBAR_TOGGLED_KEY);
    if (savedValue === null) return;
    mainApp.classList.toggle('sidebar-toggled', savedValue === 'true');
}

function canAccessSection(sectionId, role) {
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) return false;
    if (targetSection.classList.contains('captain-only')) return role === 'captain';
    if (targetSection.classList.contains('auth-only')) return role === 'captain' || role === 'member';
    return true;
}

function getInitialSection(role) {
    const savedSection = localStorage.getItem(LAST_SECTION_KEY) || 'home';
    return canAccessSection(savedSection, role) ? savedSection : 'home';
}

function showSidebarToggleHint() {
    const hint = document.getElementById('sidebar-toggle-hint');
    const mainApp = document.getElementById('main-app');
    if (!hint) return;
    if (!mainApp || !mainApp.classList.contains('sidebar-toggled')) {
        hideSidebarToggleHint();
        return;
    }

    window.clearTimeout(sidebarHintTimer);
    hint.classList.remove('visible');
    void hint.offsetWidth;
    hint.classList.add('visible');

    sidebarHintTimer = window.setTimeout(() => {
        hint.classList.remove('visible');
    }, 4500);
}

function hideSidebarToggleHint() {
    const hint = document.getElementById('sidebar-toggle-hint');
    if (!hint) return;

    window.clearTimeout(sidebarHintTimer);
    hint.classList.remove('visible');
}

function showSection(sectionId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.style.display = 'none';
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
        localStorage.setItem(LAST_SECTION_KEY, sectionId);
    } else {
        console.error('Element with ID "' + sectionId + '" not found.');
        return; 
    }

    const menuItems = document.querySelectorAll('.menu-list li');
    menuItems.forEach(item => {
        item.classList.remove('active');
    });

    const activeItem = Array.from(menuItems).find(item => {
        const onclickAttr = item.getAttribute('onclick') || '';
        return onclickAttr.includes(`'${sectionId}'`) || onclickAttr.includes(`"${sectionId}"`);
    });

    if (activeItem) {
        activeItem.classList.add('active');
    }

    // Close sidebar on mobile after clicking a link
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

function toggleSidebarMobile() {
    const sidebar = document.querySelector('.sidebar');
    if(sidebar) sidebar.classList.toggle('active'); 
}



// ==========================================
// 2. Authentication & Account Management
// ==========================================

function openLogin() {
    document.getElementById('login-overlay').style.setProperty('display', 'flex', 'important');
    toggleAuthMode('login'); 
}

function closeLogin() {
    document.getElementById('login-overlay').style.setProperty('display', 'none', 'important');
}

function toggleAuthMode(mode) {
    const loginForm = document.getElementById('login-form-container');
    const registerForm = document.getElementById('register-form-container');
    const errorMsg = document.getElementById('login-error');
    const regMsg = document.getElementById('reg-message');

    if (errorMsg) errorMsg.style.display = 'none';
    if (regMsg) regMsg.innerText = '';

    if (!loginForm || !registerForm) {
        console.error("找不到登入或註冊表單。");
        return;
    }

    if (mode === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

function togglePasswordVisibility(inputId, spanElement) {
    const passwordInput = document.getElementById(inputId);
    const iconElement = spanElement.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        iconElement.classList.remove('fa-eye-slash');
        iconElement.classList.add('fa-eye');
    } else {
        passwordInput.type = 'password';
        iconElement.classList.remove('fa-eye');
        iconElement.classList.add('fa-eye-slash');
    }
}

async function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const role = document.getElementById('reg-role').value;
    const password = document.getElementById('reg-password').value;
    const messageEl = document.getElementById('reg-message');

    if (!username || !password) {
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '請填寫所有欄位。';
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const data = await response.json();

        if (response.ok) {
            messageEl.style.color = '#2ecc71'; 
            messageEl.innerText = data.message;
            
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
            
            setTimeout(() => toggleAuthMode('login'), 2000);
        } else {
            messageEl.style.color = '#ff4757';
            messageEl.innerText = data.error || '註冊失敗。';
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '伺服器錯誤。';
    }
}

async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    if (!username || !password) {
        errorMsg.innerText = '請輸入姓名與密碼。';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();

        if (response.ok) {
            errorMsg.style.display = 'none';
            closeLogin();
            
            // Save login state to browser memory
            localStorage.setItem('vbt_username', username);
            localStorage.setItem('vbt_role', data.role);
            
            // Update UI
            applyLoginUI(username, data.role);
            showSection('home');

        } else {
            errorMsg.innerText = data.error || '登入失敗。';
            errorMsg.style.display = 'block';
            document.getElementById('login-password').value = '';
        }
    } catch (error) {
        console.error('Error:', error);
        errorMsg.innerText = '伺服器連線失敗。';
        errorMsg.style.display = 'block';
    }
}

/**
 * Helper function to apply UI changes after a successful login (manual or auto)
 */
function applyLoginUI(username, role) {
    // 1. 基本用戶資訊更新
    document.getElementById('guest-zone').style.display = 'none';
    document.getElementById('user-zone').style.display = 'flex';
    document.getElementById('display-avatar').innerText = username.charAt(0).toUpperCase();
    
    const roleDisplay = document.getElementById('display-role');
    if (roleDisplay) {
        roleDisplay.innerText = role.toUpperCase();
        roleDisplay.classList.remove('captain');
        if (role === 'captain') roleDisplay.classList.add('captain');
    }

    // 🌟 2. 權限全域刷新 (關鍵修改)
    const allAuthItems = document.querySelectorAll('.auth-only');
    const allCaptainItems = document.querySelectorAll('.captain-only');

    // 先處理所有登入者可見的
    allAuthItems.forEach(item => {
        if (role === 'captain' || role === 'member') {
            // 如果是 Member 且該元素同時又是 Captain-only，就隱藏
            if (role === 'member' && item.classList.contains('captain-only')) {
                item.style.setProperty('display', 'none', 'important');
            } else {
                item.style.setProperty('display', 'flex', 'important');
            }
        } else {
            item.style.setProperty('display', 'none', 'important');
        }
    });

    // 🌟 額外處理「純 Captain」的元素 (例如你的 Scraper Panel)
    allCaptainItems.forEach(item => {
        if (role === 'captain') {
            item.style.setProperty('display', 'flex', 'important');
        } else {
            item.style.setProperty('display', 'none', 'important');
        }
    });

    // 3. 載入相關數據
    if (role === 'captain') {
        loadPendingUsers();
        loadTeamMembers();
    }
    loadGallery();
    loadCourtStatus();
    loadTeamResources();
    window.setTimeout(showSidebarToggleHint, 300);
}

function handleLogout() {
    // Clear browser memory on logout
    localStorage.removeItem('vbt_username');
    localStorage.removeItem('vbt_role');
    location.reload(); 
}

function toggleAvatarMenu(event) {
    event.stopPropagation(); 
    const menu = document.getElementById('avatarMenu');
    if(menu) menu.classList.toggle('active');
}

window.onclick = function(event) {
    if (!event.target.closest('.avatar-dropdown-container')) {
        const dropdowns = document.getElementsByClassName("avatar-dropdown-menu");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('active')) {
                dropdowns[i].classList.remove('active');
            }
        }
    }
}


// ==========================================
// 3. Captain Panel: Role & User Management
// ==========================================

async function loadPendingUsers() {
    const container = document.getElementById('pending-users-container');
    if (!container) return;
    
    try {
        const response = await fetch('/api/pending_users');
        const users = await response.json();
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding: 20px;">目前沒有待審核申請。</p>';
            return;
        }
        
        let html = '<ul style="list-style: none; padding: 0;">';
        users.forEach(user => {
            html += `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee;">
                    <div>
                        <strong style="font-size: 1.1em;">${user.username}</strong> 
                        <span style="color: #666; font-size: 0.9em; margin-left: 10px; background: #f0f2f5; padding: 4px 8px; border-radius: 6px;">申請身分：${user.role === 'captain' ? '隊長' : '隊員'}</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="approveUser(${user.id}, 'approve')" class="primary-btn-sm" style="background: #2ecc71;">通過</button>
                        <button onclick="approveUser(${user.id}, 'reject')" class="primary-btn-sm" style="background: #e74c3c;">拒絕</button>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p style="text-align:center; color:#e74c3c;">資料載入失敗。</p>';
    }
}

async function approveUser(userId, action) {
    if (!confirm(`確定要${action === 'approve' ? '通過' : '拒絕'}這位使用者嗎？`)) return;
    
    try {
        const response = await fetch('/api/approve_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: action })
        });
        
        if (response.ok) {
            loadPendingUsers(); 
            loadTeamMembers();
        } else {
            alert('操作失敗。');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadTeamMembers() {
    const container = document.getElementById('team-members-container');
    if (!container) return;
    
    try {
        const response = await fetch('/api/team_members');
        const users = await response.json();
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding: 20px;">目前沒有其他隊員。</p>';
            return;
        }
        
        let html = '<ul style="list-style: none; padding: 0;">';
        users.forEach(user => {
            const isCaptain = user.role === 'captain' ? 'selected' : '';
            const isMember = user.role === 'member' ? 'selected' : '';
            
            html += `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee;">
                    <div>
                        <strong style="font-size: 1.1em;">${user.username}</strong> 
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <select onchange="changeUserRole(${user.id}, this.value)" style="padding: 6px 10px; border-radius: 6px; width: auto; margin-bottom: 0;">
                            <option value="member" ${isMember}>隊員</option>
                            <option value="captain" ${isCaptain}>隊長</option>
                        </select>
                        <button onclick="deleteUser(${user.id})" class="primary-btn-sm" style="background: #e74c3c;">刪除</button>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p style="text-align:center; color:#e74c3c;">名單載入失敗。</p>';
    }
}

async function deleteUser(userId) {
    if (!confirm('確定要永久刪除此帳號嗎？')) return;
    
    try {
        const response = await fetch('/api/delete_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        
        if (response.ok) {
            loadTeamMembers(); 
        } else {
            alert('刪除使用者失敗。');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function changeUserRole(userId, newRole) {
    if (!confirm(`確定要把這位使用者的身分改成${newRole === 'captain' ? '隊長' : '隊員'}嗎？`)) {
        loadTeamMembers(); 
        return;
    }
    
    try {
        const response = await fetch('/api/update_role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, new_role: newRole })
        });
        
        if (response.ok) {
            alert(`身分已更新為${newRole === 'captain' ? '隊長' : '隊員'}。`);
            loadTeamMembers(); 
        } else {
            alert('更新身分失敗。');
        }
    } catch (error) {
        console.error('Error updating role:', error);
    }
}


// ==========================================
// 4. Match Analysis & Videos
// ==========================================

let videoSectionsState = [];
let activeVideoNotesSectionId = null;
let teamResourceSectionsState = [];
let activeTeamResourceNotesSectionId = null;
let activeNotesScope = 'video';
let sectionDragState = null;

function getYouTubeVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = String(url || '').match(regExp);
    return (match && match[2] && match[2].length === 11) ? match[2] : null;
}

function isCaptainRole() {
    return localStorage.getItem('vbt_role') === 'captain';
}

function buildSectionReorderHandle(scope, sectionId) {
    if (!isCaptainRole()) return '';
    return `
        <button
            type="button"
            class="section-reorder-handle"
            draggable="true"
            title="拖曳調整順序"
            ondragstart="handleSectionDragStart(event, '${scope}', '${sectionId}')"
            ondragend="handleSectionDragEnd()"
        >
            <i class="fas fa-grip-vertical"></i>
        </button>
    `;
}

function buildSectionCardDndAttrs(scope, sectionId) {
    if (!isCaptainRole()) return '';
    return `ondragover="handleSectionDragOver(event, '${scope}', '${sectionId}')" ondrop="handleSectionDrop(event, '${scope}', '${sectionId}')" ondragleave="handleSectionDragLeave(event)"`;
}

function buildSectionRenameButton(scope, sectionId, currentTitle) {
    if (!isCaptainRole()) return '';
    const encodedTitle = encodeURIComponent(String(currentTitle || ''));
    return `
        <button
            type="button"
            class="video-section-card__icon-btn"
            title="更改 session 名稱"
            onclick="renameSection('${scope}', '${sectionId}', decodeURIComponent('${encodedTitle}'))"
        >
            <i class="fas fa-pen"></i>
        </button>
    `;
}

function updateVideoSectionSelect() {
    const select = document.getElementById('video-section-select');
    if (!select) return;
    const sections = Array.isArray(videoSectionsState) ? videoSectionsState : [];
    if (!sections.length) {
        select.innerHTML = '<option value="">請先建立分類</option>';
        return;
    }
    select.innerHTML = '<option value="">選擇分類</option>' + sections.map((section) => `
        <option value="${section.id}">${escapeHtml(section.title)}</option>
    `).join('');
}

function renderVideoThumbnailCard(video, sectionId) {
    const videoId = getYouTubeVideoId(video.url);
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';
    const title = video.title && video.title.trim() ? video.title.trim() : '比賽影片';
    const preview = videoId
        ? `<div class="video-preview" style="background-image: url('${thumbnailUrl}'); height: 160px; background-size: cover;"></div>`
        : `<div class="video-preview" style="height: 160px;"><span class="play-label">開啟連結</span></div>`;
    return `
        <div class="video-card">
            <button class="delete-btn" onclick="deleteVideoItem(${video.id}, ${sectionId})">刪除</button>
            <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: inherit;">
                ${preview}
                <div class="video-info">
                    <h5>${escapeHtml(title)}</h5>
                    <p>${escapeHtml(video.url.length > 46 ? `${video.url.slice(0, 46)}...` : video.url)}</p>
                </div>
            </a>
        </div>
    `;
}

function renderVideoSections() {
    const container = document.getElementById('video-sections-container');
    if (!container) return;
    const sections = Array.isArray(videoSectionsState) ? videoSectionsState : [];
    if (!sections.length) {
        container.innerHTML = '<div class="card"><p style="color:#7b8c9b; margin:0;">目前還沒有比賽分類，請先在上方建立分類。</p></div>';
        updateVideoSectionSelect();
        return;
    }

    container.innerHTML = sections.map((section) => `
        <div class="video-section-card" data-section-scope="video" data-section-id="${section.id}" ${buildSectionCardDndAttrs('video', section.id)}>
            <div class="video-section-card__header">
                <div class="video-section-card__title">
                    ${buildSectionReorderHandle('video', section.id)}
                    <h4>${escapeHtml(section.title)}</h4>
                    <button type="button" class="video-section-card__meta" onclick="openVideoNotesModal(${section.id})">
                        <i class="fas fa-file-alt"></i>
                        <span>筆記</span>
                        <small>${Array.isArray(section.notes) ? section.notes.length : 0}</small>
                    </button>
                </div>
                <div class="video-section-card__actions">
                    ${buildSectionRenameButton('video', section.id, section.title)}
                    ${isCaptainRole() ? `<button type="button" class="video-section-card__delete" onclick="deleteVideoSection(${section.id})">刪除</button>` : ''}
                </div>
            </div>
            <div class="video-section-card__body">
                ${section.videos && section.videos.length
                    ? `<div class="video-section-card__scroller">${section.videos.map((video) => renderVideoThumbnailCard(video, section.id)).join('')}</div>`
                    : '<div class="video-section-card__empty">這個分類目前沒有影片。</div>'}
            </div>
        </div>
    `).join('');
    updateVideoSectionSelect();
}

async function loadVideoSections() {
    try {
        const response = await fetch('/api/video_sections');
        videoSectionsState = await response.json();
        renderVideoSections();
    } catch (error) {
        console.error('Failed to load video sections', error);
    }
}

function updateTeamResourceSectionSelect() {
    const select = document.getElementById('team-resource-section-select');
    if (!select) return;
    const sections = Array.isArray(teamResourceSectionsState) ? teamResourceSectionsState : [];
    if (!sections.length) {
        select.innerHTML = '<option value="">請先建立資料分類</option>';
        return;
    }
    select.innerHTML = '<option value="">選擇資料分類</option>' + sections.map((section) => `
        <option value="${section.id}">${escapeHtml(section.title)}</option>
    `).join('');
}

function renderTeamResourceSections() {
    const container = document.getElementById('team-resource-sections-container');
    if (!container) return;
    const sections = Array.isArray(teamResourceSectionsState) ? teamResourceSectionsState : [];
    if (!sections.length) {
        container.innerHTML = '<div class="card"><p style="color:#7b8c9b; margin:0;">目前還沒有球隊資料，隊長可以先建立分類並加入 Google 文件。</p></div>';
        updateTeamResourceSectionSelect();
        return;
    }

    container.innerHTML = sections.map((section) => `
        <div class="video-section-card" data-section-scope="team_resource" data-section-id="${section.id}" ${buildSectionCardDndAttrs('team_resource', section.id)}>
            <div class="video-section-card__header">
                <div class="video-section-card__title">
                    ${buildSectionReorderHandle('team_resource', section.id)}
                    <h4>${escapeHtml(section.title)}</h4>
                    <button type="button" class="video-section-card__meta" onclick="openTeamResourceNotesModal('${section.id}')">
                        <i class="fas fa-file-alt"></i>
                        <span>筆記</span>
                        <small>${Array.isArray(section.notes) ? section.notes.length : 0}</small>
                    </button>
                    ${isCaptainRole() ? `<span class="resource-visibility-chip">${section.visibility === 'all' ? '隊長隊員可見' : '只有隊長可見'}</span>` : ''}
                </div>
                <div class="video-section-card__actions">
                    ${buildSectionRenameButton('team_resource', section.id, section.title)}
                    ${isCaptainRole() ? `<button type="button" class="video-section-card__delete" onclick="deleteTeamResourceSection('${section.id}')">刪除</button>` : ''}
                </div>
            </div>
            <div class="video-section-card__body">
                ${section.resources && section.resources.length
                    ? `<div class="video-section-card__scroller">${section.resources.map((item) => renderTeamResourceCard(item, section.id)).join('')}</div>`
                    : '<div class="video-section-card__empty">這個分類目前沒有檔案。</div>'}
            </div>
        </div>
    `).join('');
    updateTeamResourceSectionSelect();
}

async function loadTeamResources() {
    try {
        const role = localStorage.getItem('vbt_role') || '';
        const response = await fetch(`/api/team_resources?role=${encodeURIComponent(role)}`);
        teamResourceSectionsState = await response.json();
        renderTeamResourceSections();
    } catch (error) {
        console.error('Failed to load team resources', error);
    }
}

async function createTeamResourceSection() {
    const input = document.getElementById('team-resource-section-title');
    const visibilityInput = document.getElementById('team-resource-section-visibility');
    const title = input ? input.value.trim() : '';
    const visibility = visibilityInput ? visibilityInput.value : 'captain';
    if (!title) {
        alert('請輸入分類名稱。');
        return;
    }

    const response = await fetch('/api/team_resources/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, visibility }),
    });
    if (!response.ok) {
        alert('建立分類失敗。');
        return;
    }

    if (input) input.value = '';
    if (visibilityInput) visibilityInput.value = 'captain';
    await loadTeamResources();
}

async function addTeamResourceItem() {
    const urlInput = document.getElementById('team-resource-url');
    const titleInput = document.getElementById('team-resource-title');
    const sectionSelect = document.getElementById('team-resource-section-select');
    const url = urlInput ? urlInput.value.trim() : '';
    const title = titleInput ? titleInput.value.trim() : '';
    const sectionId = sectionSelect ? sectionSelect.value : '';

    if (!sectionId) return alert('請先選擇資料分類。');
    if (!url) return alert('請先貼上 Google Docs 或 Google Sheets 連結。');

    const response = await fetch('/api/team_resources/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, section_id: sectionId }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || '新增資料失敗。');
        return;
    }

    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    await loadTeamResources();
}

async function deleteTeamResourceItem(itemId, sectionId) {
    if (!confirm('確定要刪除這份球隊資料嗎？')) return;
    const response = await fetch(`/api/team_resources/items/${itemId}`, { method: 'DELETE' });
    if (!response.ok) {
        alert('刪除資料失敗。');
        return;
    }
    await loadTeamResources();
    if (activeTeamResourceNotesSectionId === sectionId) {
        openTeamResourceNotesModal(sectionId);
    }
}

async function deleteTeamResourceSection(sectionId) {
    if (!confirm('確定要刪除這個資料分類嗎？裡面的 Google 文件與 notes 也會一起刪除。')) return;
    const response = await fetch(`/api/team_resources/sections/${sectionId}`, { method: 'DELETE' });
    if (!response.ok) {
        alert('刪除資料分類失敗。');
        return;
    }
    if (activeTeamResourceNotesSectionId === sectionId) closeVideoNotesModal();
    await loadTeamResources();
}

async function renameSection(scope, sectionId, currentTitle) {
    if (!isCaptainRole()) return;
    const nextTitle = window.prompt('請輸入新的 session 名稱', currentTitle || '');
    if (nextTitle === null) return;
    const title = nextTitle.trim();
    if (!title || title === String(currentTitle || '').trim()) return;

    const endpoint = scope === 'video'
        ? `/api/video_sections/${sectionId}`
        : `/api/team_resources/sections/${sectionId}`;

    const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || '更改 session 名稱失敗。');
        return;
    }

    if (scope === 'video') await loadVideoSections();
    else await loadTeamResources();
}

function clearSectionDragIndicators() {
    document.querySelectorAll('.video-section-card.section-drop-before, .video-section-card.section-drop-after, .video-section-card.is-section-dragging').forEach((card) => {
        card.classList.remove('section-drop-before', 'section-drop-after', 'is-section-dragging');
    });
}

function handleSectionDragStart(event, scope, sectionId) {
    if (!isCaptainRole()) return;
    sectionDragState = { scope, sectionId: String(sectionId) };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(sectionDragState));
    const card = event.target.closest('.video-section-card');
    if (card) card.classList.add('is-section-dragging');
}

function handleSectionDragEnd() {
    sectionDragState = null;
    clearSectionDragIndicators();
}

function handleSectionDragOver(event, scope, sectionId) {
    if (!isCaptainRole()) return;
    event.preventDefault();
    const card = event.currentTarget;
    if (!card || !sectionDragState || sectionDragState.scope !== scope || sectionDragState.sectionId === String(sectionId)) return;
    clearSectionDragIndicators();
    const rect = card.getBoundingClientRect();
    const before = event.clientY < rect.top + (rect.height / 2);
    card.classList.add(before ? 'section-drop-before' : 'section-drop-after');
}

function handleSectionDragLeave(event) {
    const card = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (card && relatedTarget && card.contains(relatedTarget)) return;
    if (card) card.classList.remove('section-drop-before', 'section-drop-after');
}

function reorderSectionState(scope, draggedId, targetId, insertBefore) {
    const sourceState = scope === 'video' ? videoSectionsState : teamResourceSectionsState;
    const nextState = [...sourceState];
    const fromIndex = nextState.findIndex((section) => String(section.id) === String(draggedId));
    const targetIndex = nextState.findIndex((section) => String(section.id) === String(targetId));
    if (fromIndex < 0 || targetIndex < 0) return null;
    const [moved] = nextState.splice(fromIndex, 1);
    let insertIndex = targetIndex;
    if (!insertBefore && fromIndex < targetIndex) insertIndex = targetIndex;
    else if (!insertBefore) insertIndex = targetIndex + 1;
    else if (insertBefore && fromIndex < targetIndex) insertIndex = targetIndex - 1;
    insertIndex = Math.max(0, Math.min(insertIndex, nextState.length));
    nextState.splice(insertIndex, 0, moved);
    if (scope === 'video') videoSectionsState = nextState;
    else teamResourceSectionsState = nextState;
    return nextState;
}

async function persistSectionOrder(scope, sections) {
    const endpoint = scope === 'video' ? '/api/video_sections/reorder' : '/api/team_resources/reorder';
    const order = (sections || []).map((section) => section.id);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
    });
    if (!response.ok) throw new Error(`Failed to reorder ${scope} sections`);
}

async function handleSectionDrop(event, scope, targetId) {
    if (!isCaptainRole()) return;
    event.preventDefault();
    const card = event.currentTarget;
    try {
        const payload = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (!payload || payload.scope !== scope || String(payload.sectionId) === String(targetId)) return;
        const rect = card.getBoundingClientRect();
        const insertBefore = event.clientY < rect.top + (rect.height / 2);
        const nextState = reorderSectionState(scope, payload.sectionId, targetId, insertBefore);
        if (!nextState) return;
        if (scope === 'video') renderVideoSections();
        else renderTeamResourceSections();
        await persistSectionOrder(scope, nextState);
    } catch (error) {
        console.error('Failed to reorder sections', error);
        if (scope === 'video') await loadVideoSections();
        else await loadTeamResources();
    } finally {
        handleSectionDragEnd();
    }
}

async function createVideoSection() {
    const input = document.getElementById('video-section-title');
    const title = input ? input.value.trim() : '';
    if (!title) {
        alert('請輸入分類名稱。');
        return;
    }

    const response = await fetch('/api/video_sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!response.ok) {
        alert('建立分類失敗。');
        return;
    }

    if (input) input.value = '';
    await loadVideoSections();
}

async function addVideo() {
    const urlInput = document.getElementById('video-url');
    const titleInput = document.getElementById('video-title');
    const sectionSelect = document.getElementById('video-section-select');
    const url = urlInput ? urlInput.value.trim() : '';
    const title = titleInput ? titleInput.value.trim() : '';
    const sectionId = sectionSelect ? sectionSelect.value : '';

    if (!sectionId) return alert('請先選擇一個分類。');
    if (!url) return alert('請輸入 YouTube 網址。');

    const response = await fetch('/add_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, section_id: Number(sectionId) }),
    });

    if (!response.ok) {
        alert('影片儲存失敗。');
        return;
    }

    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    await loadVideoSections();
}

async function deleteVideoItem(videoId, sectionId) {
    if (!confirm('確定要從這個分類刪除這支影片嗎？')) return;
    try {
        const response = await fetch('/delete_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: videoId }),
        });
        if (!response.ok) {
            alert('從資料庫刪除影片失敗。');
            return;
        }
        await loadVideoSections();
        if (activeVideoNotesSectionId === sectionId) {
            openVideoNotesModal(sectionId);
        }
    } catch (error) {
        console.error('Error deleting video:', error);
    }
}

async function deleteVideoSection(sectionId) {
    if (!confirm('確定要刪除整個比賽分類嗎？包含底下的影片與筆記。')) return;
    const response = await fetch(`/api/video_sections/${sectionId}`, { method: 'DELETE' });
    if (!response.ok) {
        alert('刪除分類失敗。');
        return;
    }
    if (activeVideoNotesSectionId === sectionId) closeVideoNotesModal();
    await loadVideoSections();
}

function buildVideoNoteRow(note = {}) {
    if (activeNotesScope === 'team_resource') {
        return `
            <div class="video-note-row video-note-row--simple">
                <div class="video-note-row__top">
                    <button type="button" class="video-note-row__remove" onclick="removeVideoNoteRow(this)">移除</button>
                </div>
                <textarea class="video-note-content" placeholder="筆記">${escapeHtml(note.notes || '')}</textarea>
            </div>
        `;
    }
    return `
        <div class="video-note-row">
            <div class="video-note-row__top">
                <input type="text" class="video-note-match" placeholder="比賽名稱" value="${escapeHtml(note.match_name || '')}">
                <input type="text" class="video-note-score" placeholder="比分" value="${escapeHtml(note.score || '')}">
                <button type="button" class="video-note-row__remove" onclick="removeVideoNoteRow(this)">移除</button>
            </div>
            <textarea class="video-note-content" placeholder="筆記">${escapeHtml(note.notes || '')}</textarea>
        </div>
    `;
}

function addVideoNoteRow(note = {}) {
    const list = document.getElementById('video-notes-list');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', buildVideoNoteRow(note));
    applyNotesModalMode();
}

function removeVideoNoteRow(button) {
    const row = button.closest('.video-note-row');
    if (row) row.remove();
}

function applyNotesModalMode() {
    const isTeamResource = activeNotesScope === 'team_resource';
    const readOnly = isTeamResource && !isCaptainRole();
    const addButton = document.querySelector('#video-notes-modal .video-notes-modal__toolbar .court-btn');
    const saveButton = document.querySelector('#video-notes-modal .video-notes-modal__actions .court-btn:last-child');
    const removeButtons = document.querySelectorAll('#video-notes-list .video-note-row__remove');
    const inputs = document.querySelectorAll('#video-notes-list .video-note-match, #video-notes-list .video-note-score, #video-notes-list .video-note-content');
    if (addButton) addButton.style.display = isTeamResource || readOnly ? 'none' : 'inline-flex';
    if (saveButton) saveButton.style.display = readOnly ? 'none' : 'inline-flex';
    removeButtons.forEach((button) => {
        button.style.display = isTeamResource || readOnly ? 'none' : 'inline-flex';
    });
    inputs.forEach((input) => {
        input.disabled = readOnly;
        if (input.tagName === 'TEXTAREA') {
            input.readOnly = readOnly;
        }
    });
}

function openNotesModal(titleText, notes) {
    const modal = document.getElementById('video-notes-modal');
    const title = document.getElementById('video-notes-modal-title');
    const list = document.getElementById('video-notes-list');
    if (!modal || !title || !list) return;

    title.textContent = titleText;
    list.innerHTML = '';
    const nextNotes = activeNotesScope === 'team_resource'
        ? [Array.isArray(notes) && notes.length ? notes[0] : {}]
        : (Array.isArray(notes) && notes.length ? notes : [{}]);
    nextNotes.forEach((note) => addVideoNoteRow(note));
    applyNotesModalMode();
    modal.style.display = 'flex';
}

function openVideoNotesModal(sectionId) {
    const section = videoSectionsState.find((item) => item.id === sectionId);
    if (!section) return;

    activeNotesScope = 'video';
    activeVideoNotesSectionId = sectionId;
    activeTeamResourceNotesSectionId = null;
    openNotesModal(section.title, section.notes);
}

function openTeamResourceNotesModal(sectionId) {
    const section = teamResourceSectionsState.find((item) => item.id === sectionId);
    if (!section) return;

    activeNotesScope = 'team_resource';
    activeTeamResourceNotesSectionId = sectionId;
    activeVideoNotesSectionId = null;
    openNotesModal(section.title, section.notes);
}

function closeVideoNotesModal() {
    const modal = document.getElementById('video-notes-modal');
    if (modal) modal.style.display = 'none';
    activeVideoNotesSectionId = null;
    activeTeamResourceNotesSectionId = null;
    activeNotesScope = 'video';
}

async function saveVideoNotes() {
    if (activeNotesScope === 'team_resource' && !isCaptainRole()) return;
    const currentScope = activeNotesScope;
    const targetId = currentScope === 'team_resource' ? activeTeamResourceNotesSectionId : activeVideoNotesSectionId;
    if (!targetId) return;
    const rows = Array.from(document.querySelectorAll('#video-notes-list .video-note-row'));
    const notes = rows.map((row) => ({
        match_name: currentScope === 'team_resource' ? '' : (row.querySelector('.video-note-match')?.value.trim() || ''),
        score: currentScope === 'team_resource' ? '' : (row.querySelector('.video-note-score')?.value.trim() || ''),
        notes: row.querySelector('.video-note-content')?.value.trim() || '',
    })).filter((item) => item.match_name || item.score || item.notes);

    const endpoint = currentScope === 'team_resource'
        ? `/api/team_resources/sections/${targetId}/notes`
        : `/api/video_sections/${targetId}/notes`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
    });
    if (!response.ok) {
        alert('儲存筆記失敗。');
        return;
    }

    closeVideoNotesModal();
    if (currentScope === 'team_resource') await loadTeamResources();
    else await loadVideoSections();
}

window.addEventListener('load', loadVideoSections);
window.addEventListener('load', loadTeamResources);
window.addEventListener('load', initCourtWeekdayFilters);
window.addEventListener('load', loadCourtStatus);

// ==========================================
// 5. Application Feature Functions (Mocks & Tools)
// ==========================================
async function uploadPhotos() {
    const fileInput = document.getElementById('photo-upload');
    const uploadBtn = fileInput.nextElementSibling;

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('請先選擇要上傳的照片。');
        return;
    }

    // Prepare files to be sent to the backend
    const formData = new FormData();
    Array.from(fileInput.files).forEach(file => {
        formData.append('file', file);
    });
    
    // Attach uploader name from LocalStorage
    const uploader = localStorage.getItem('vbt_username') || 'Guest';
    formData.append('uploader', uploader);

    // Update UI to show loading state
    const originalText = uploadBtn.innerText;
    uploadBtn.innerText = '上傳中...';
    uploadBtn.disabled = true;

    try {
        const response = await fetch('/api/upload-photo', {
            method: 'POST',
            body: formData // No Headers needed, browser handles FormData boundary automatically
        });
        
        const data = await response.json();
        
        if (response.ok) {
            fileInput.value = ''; 
            document.getElementById('file-chosen-text').innerText = '尚未選擇檔案';
            document.getElementById('file-chosen-text').style.color = '#666';
            loadGallery();
        } else {                alert(data.message || '系統拒絕存取。請登入台大場地系統後，再試著重新爬取。');
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('上傳時發生伺服器錯誤。');
    } finally {
        uploadBtn.innerText = originalText;
        uploadBtn.disabled = false;
    }
}
async function loadGallery() {
    const gallery = document.querySelector('.photo-gallery');
    if (!gallery) return;

    const currentRole = localStorage.getItem('vbt_role');
    const canDelete = currentRole === 'member' || currentRole === 'captain';
    const canSelect = currentRole === 'captain'; // 假設只有隊長可以決定輪播照片

    try {
        // 同時抓取所有照片，以及「被選中」的照片名單
        const [galleryRes, selectedRes] = await Promise.all([
            fetch('/api/gallery'),
            fetch('/api/showcase_photos')
        ]);
        
        const photos = await galleryRes.json();
        const selectedPhotos = await selectedRes.json();
        
        gallery.innerHTML = ''; 
        if (photos.length === 0) {
            gallery.innerHTML = '<p style="color:#999; grid-column: 1 / -1;">目前還沒有照片。來上傳第一張照片吧！</p>';
            return;
        }

        photos.forEach((photo) => {
            const filename = photo.filename;
            const card = document.createElement('div');
            card.className = 'photo-card';
            const imgPath = photo.src;
            const isSelected = selectedPhotos.includes(filename);
            
            if (isSelected) {
                card.classList.add('selected');
            }
            
            let actionBtnsHtml = '';
            if (canDelete) {
                actionBtnsHtml += `<button class="photo-delete-btn" onclick="deletePhoto('${filename}', this)">刪除</button>`;
            }
            // 新增：加入輪播圖的按鈕
            if (canSelect) {
                const btnText = isSelected ? '★ 輪播中' : '☆ 選擇';
                actionBtnsHtml += `<button class="photo-toggle-btn" onclick="toggleShowcasePhoto('${filename}', this)">${btnText}</button>`;
            }
            card.innerHTML = `
                ${actionBtnsHtml}
                <img src="${imgPath}" alt="${filename}" class="gallery-img" onclick="openLightbox('${imgPath}')">
            `;
            gallery.appendChild(card);
        });
        updateShowcaseCropGuide();
    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

function updateShowcaseCropGuide() {
    const root = document.documentElement;
    if (!root) return;
    const mainApp = document.getElementById('main-app');
    const showcase = document.getElementById('showcase-slider-container');
    const mainContent = document.querySelector('.main-content');
    if (!mainApp || !showcase || !mainContent) return;

    const originalToggled = mainApp.classList.contains('sidebar-toggled');
    const originalDisplay = showcase.style.display;
    const originalVisibility = showcase.style.visibility;
    if (getComputedStyle(showcase).display === 'none') {
        showcase.style.visibility = 'hidden';
        showcase.style.display = 'block';
    }

    const measureInsets = (toggled) => {
        mainApp.classList.toggle('sidebar-toggled', toggled);
        const showcaseRect = showcase.getBoundingClientRect();
        const mainRect = mainContent.getBoundingClientRect();
        const visibleLeft = Math.max(showcaseRect.left, mainRect.left);
        const visibleRight = Math.min(showcaseRect.right, mainRect.right);
        const width = showcaseRect.width || 1;
        return {
            left: Math.max(0, ((visibleLeft - showcaseRect.left) / width) * 100),
            right: Math.max(0, ((showcaseRect.right - visibleRight) / width) * 100),
        };
    };

    const openInsets = measureInsets(false);
    const closedInsets = measureInsets(true);

    mainApp.classList.toggle('sidebar-toggled', originalToggled);
    showcase.style.display = originalDisplay;
    showcase.style.visibility = originalVisibility;

    root.style.setProperty('--showcase-open-left-inset', `${openInsets.left}%`);
    root.style.setProperty('--showcase-open-right-inset', `${openInsets.right}%`);
    root.style.setProperty('--showcase-closed-left-inset', `${closedInsets.left}%`);
    root.style.setProperty('--showcase-closed-right-inset', `${closedInsets.right}%`);
}

const showcaseCropState = {
    filename: null,
    imageSrc: null,
    naturalWidth: 0,
    naturalHeight: 0,
    baseScale: 1,
    scaleMultiplier: 1,
    offsetX: 0,
    offsetY: 0,
    dragStartX: 0,
    dragStartY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pointerId: null,
    triggerButton: null,
};

function getShowcaseCropElements() {
    return {
        modal: document.getElementById('showcase-crop-modal'),
        stage: document.getElementById('showcase-crop-stage'),
        image: document.getElementById('showcase-crop-image'),
        zoom: document.getElementById('showcase-crop-zoom'),
    };
}

function applyShowcaseCropTransform() {
    const { stage, image } = getShowcaseCropElements();
    if (!stage || !image || !showcaseCropState.naturalWidth || !showcaseCropState.naturalHeight) return;
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const scale = showcaseCropState.baseScale * showcaseCropState.scaleMultiplier;
    const displayWidth = showcaseCropState.naturalWidth * scale;
    const displayHeight = showcaseCropState.naturalHeight * scale;
    const maxOffsetX = Math.max(0, (displayWidth - stageWidth) / 2);
    const maxOffsetY = Math.max(0, (displayHeight - stageHeight) / 2);
    showcaseCropState.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, showcaseCropState.offsetX));
    showcaseCropState.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, showcaseCropState.offsetY));
    image.style.transform = `translate(-50%, -50%) translate(${showcaseCropState.offsetX}px, ${showcaseCropState.offsetY}px) scale(${scale})`;
}

function nudgeShowcaseCrop(deltaX, deltaY) {
    if (!showcaseCropState.filename) return;
    showcaseCropState.offsetX += deltaX;
    showcaseCropState.offsetY += deltaY;
    applyShowcaseCropTransform();
}

function initShowcaseCropInteractions() {
    const { stage, zoom } = getShowcaseCropElements();
    if (!stage || stage.dataset.bound === 'true') return;
    stage.dataset.bound = 'true';

    stage.addEventListener('pointerdown', (event) => {
        if (!showcaseCropState.filename) return;
        showcaseCropState.pointerId = event.pointerId;
        showcaseCropState.dragStartX = event.clientX;
        showcaseCropState.dragStartY = event.clientY;
        showcaseCropState.startOffsetX = showcaseCropState.offsetX;
        showcaseCropState.startOffsetY = showcaseCropState.offsetY;
        stage.classList.add('is-dragging');
        stage.setPointerCapture(event.pointerId);
    });

    stage.addEventListener('pointermove', (event) => {
        if (showcaseCropState.pointerId !== event.pointerId) return;
        showcaseCropState.offsetX = showcaseCropState.startOffsetX + (event.clientX - showcaseCropState.dragStartX);
        showcaseCropState.offsetY = showcaseCropState.startOffsetY + (event.clientY - showcaseCropState.dragStartY);
        applyShowcaseCropTransform();
    });

    const endDrag = (event) => {
        if (showcaseCropState.pointerId !== event.pointerId) return;
        showcaseCropState.pointerId = null;
        stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    if (zoom) {
        zoom.addEventListener('input', () => {
            showcaseCropState.scaleMultiplier = Number.parseFloat(zoom.value) || 1;
            applyShowcaseCropTransform();
        });
    }
}

async function openShowcaseCropModal(filename, btnElement) {
    const { modal, stage, image, zoom } = getShowcaseCropElements();
    if (!modal || !stage || !image || !zoom) return;
    initShowcaseCropInteractions();
    updateShowcaseCropGuide();

    showcaseCropState.filename = filename;
    const galleryResponse = await fetch('/api/gallery');
    const galleryPhotos = await galleryResponse.json();
    const selectedPhoto = galleryPhotos.find((photo) => photo.filename === filename);
    if (!selectedPhoto) return;

    showcaseCropState.imageSrc = selectedPhoto.src;
    showcaseCropState.triggerButton = btnElement || null;
    showcaseCropState.offsetX = 0;
    showcaseCropState.offsetY = 0;
    showcaseCropState.scaleMultiplier = 1.12;
    zoom.value = '1.12';
    modal.style.display = 'flex';

    const loader = new Image();
    loader.crossOrigin = 'anonymous';
    loader.onload = () => {
        showcaseCropState.naturalWidth = loader.naturalWidth;
        showcaseCropState.naturalHeight = loader.naturalHeight;
        image.crossOrigin = 'anonymous';
        image.src = showcaseCropState.imageSrc;
        requestAnimationFrame(() => {
            showcaseCropState.baseScale = Math.max(stage.clientWidth / loader.naturalWidth, stage.clientHeight / loader.naturalHeight);
            applyShowcaseCropTransform();
        });
    };
    loader.onerror = () => {
        alert('載入裁切圖片失敗。');
        closeShowcaseCropModal();
    };
    loader.src = showcaseCropState.imageSrc;
}

function closeShowcaseCropModal() {
    const { modal } = getShowcaseCropElements();
    if (modal) modal.style.display = 'none';
    showcaseCropState.filename = null;
    showcaseCropState.triggerButton = null;
    showcaseCropState.pointerId = null;
}

async function saveShowcaseCrop() {
    const { stage } = getShowcaseCropElements();
    if (!stage || !showcaseCropState.filename || !showcaseCropState.naturalWidth || !showcaseCropState.naturalHeight) return;

    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const outputWidth = 1600;
    const outputHeight = Math.round(outputWidth * (stageHeight / stageWidth));
    const scale = showcaseCropState.baseScale * showcaseCropState.scaleMultiplier;
    const displayWidth = showcaseCropState.naturalWidth * scale;
    const displayHeight = showcaseCropState.naturalHeight * scale;
    const imageLeft = (stageWidth / 2) - (displayWidth / 2) + showcaseCropState.offsetX;
    const imageTop = (stageHeight / 2) - (displayHeight / 2) + showcaseCropState.offsetY;

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
        try {
            const ratioX = outputWidth / stageWidth;
            const ratioY = outputHeight / stageHeight;
            ctx.drawImage(img, imageLeft * ratioX, imageTop * ratioY, displayWidth * ratioX, displayHeight * ratioY);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) {
                alert('建立裁切圖片失敗。');
                return;
            }

            const formData = new FormData();
            formData.append('filename', showcaseCropState.filename);
            formData.append('crop', blob, `${showcaseCropState.filename.replace(/\.[^.]+$/, '')}_showcase.jpg`);
            const response = await fetch('/api/showcase_photo_crop', { method: 'POST', body: formData });
            if (!response.ok) {
                alert('儲存輪播裁切圖片失敗。');
                return;
            }

            const selectedResponse = await fetch('/api/showcase_photos');
            let selectedPhotos = await selectedResponse.json();
            if (!selectedPhotos.includes(showcaseCropState.filename)) {
                selectedPhotos.push(showcaseCropState.filename);
                await fetch('/api/showcase_photos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ photos: selectedPhotos }),
                });
            }

            closeShowcaseCropModal();
            await loadGallery();
            loadShowcaseSlider();
        } catch (error) {
            console.error('Failed to save showcase crop:', error);
            alert('儲存輪播裁切圖片失敗。');
        }
    };
    img.onerror = () => {
        alert('載入裁切圖片資料失敗。');
    };
    img.src = showcaseCropState.imageSrc;
}

// 處理點擊「加入/移除輪播」的邏輯
async function toggleShowcasePhoto(filename, btnElement) {
    const card = btnElement.parentElement;
    const isCurrentlySelected = card.classList.contains('selected');

    const response = await fetch('/api/showcase_photos');
    let selectedPhotos = await response.json();

    if (isCurrentlySelected) {
        selectedPhotos = selectedPhotos.filter(p => p !== filename);
        card.classList.remove('selected');
        btnElement.innerText = '☆ 選擇';

        await fetch('/api/showcase_photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photos: selectedPhotos })
        });

        loadShowcaseSlider();
        return;
    }

    openShowcaseCropModal(filename, btnElement);
}

/**
 * Handle deleting a photo from the gallery
 */
async function deletePhoto(filename, btnElement) {
    if (!confirm('確定要刪除這張照片嗎？')) return;
    
    // Remove from UI immediately for better user experience
    const card = btnElement.parentElement;
    card.remove();

    try {
        const response = await fetch('/api/delete-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: filename })
        });

        if (!response.ok) {
            alert('從伺服器刪除照片失敗。');
            loadGallery(); // Reload from DB to sync UI if deletion failed
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
    }
}

function updateFileCount(input) {
    const textSpan = document.getElementById('file-chosen-text');
    if (input.files && input.files.length > 0) {
        textSpan.innerText = `已選擇 ${input.files.length} 個檔案`;
        textSpan.style.color = 'var(--accent-color)';
        textSpan.style.fontWeight = 'bold';
    } else {
        textSpan.innerText = '尚未選擇檔案';
        textSpan.style.color = '#666';
        textSpan.style.fontWeight = 'normal';
    }
}

/**
 * Lightbox Functions
 */
function openLightbox(src) {
    const lightbox = document.getElementById('lightbox-overlay');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = src;
    lightbox.style.display = 'flex';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox-overlay');
    lightbox.style.display = 'none';
}

// Ensure gallery loads automatically on page startup
window.addEventListener('load', loadGallery);
window.addEventListener('load', updateShowcaseCropGuide);
window.addEventListener('resize', updateShowcaseCropGuide);
window.addEventListener('load', initTrainingMenu);
window.addEventListener('load', initPracticeWeekdayListeners);

const menuState = {
    rows: [],
    editingId: null,
    editorOpen: false,
    practiceMenu: {
        first_half: [],
        second_half: [],
        weekdays: [],
        updated_at: ''
    },
    generatedRows: [],
    matchingRows: [],
    filters: {
        focuses: [],
        complexities: [],
        fatigue_levels: [],
        difficulty_levels: []
    }
};

const PRACTICE_WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function createMenuCheckboxMarkup(name, value, label, checked = false) {
    return `
        <label class="custom-checkbox menu-checkbox">
            <input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${checked ? 'checked' : ''}>
            <span>${escapeHtml(label)}</span>
        </label>
    `;
}

function renderMenuFilterOptions(filters) {
    const focusGrid = document.getElementById('menu-focus-grid');
    const complexityGrid = document.getElementById('menu-complexity-grid');
    const fatigueGrid = document.getElementById('menu-fatigue-grid');
    const difficultyGrid = document.getElementById('menu-difficulty-grid');

    if (focusGrid) {
        focusGrid.innerHTML = filters.focuses.map((value) => createMenuCheckboxMarkup('menu-focus', value, value)).join('');
    }
    if (complexityGrid) {
        complexityGrid.innerHTML = filters.complexities.map((value) => createMenuCheckboxMarkup('menu-complexity', value, value)).join('');
    }
    if (fatigueGrid) {
        fatigueGrid.innerHTML = filters.fatigue_levels.map((value) => createMenuCheckboxMarkup('menu-fatigue', value, value)).join('');
    }
    if (difficultyGrid) {
        difficultyGrid.innerHTML = filters.difficulty_levels.map((value) => createMenuCheckboxMarkup('menu-difficulty', value, value)).join('');
    }
}

function setMenuFilterChecked(name, checked) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
        input.checked = checked;
    });
}

function selectAllMenuFilters() {
    setMenuFilterChecked('menu-focus', true);
    setMenuFilterChecked('menu-complexity', true);
    setMenuFilterChecked('menu-fatigue', true);
    setMenuFilterChecked('menu-difficulty', true);
    generateMenu();
}

function initMenuFilterAutoRefresh() {
    ['menu-players', 'menu-court-mode', 'menu-plan-size'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', generateMenu);
            element.addEventListener('input', generateMenu);
        }
    });
    ['menu-focus-grid', 'menu-complexity-grid', 'menu-fatigue-grid', 'menu-difficulty-grid'].forEach((id) => {
        const container = document.getElementById(id);
        if (container) {
            container.addEventListener('change', generateMenu);
        }
    });
}

function getCheckedMenuValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function getMenuFiltersFromUI() {
    const playersInput = document.getElementById('menu-players');
    const courtModeInput = document.getElementById('menu-court-mode');
    const planSizeInput = document.getElementById('menu-plan-size');

    return {
        maxPlayers: Math.max(1, Number.parseInt(playersInput?.value || '0', 10) || 0),
        courtMode: courtModeInput?.value || '',
        planSize: Math.max(1, Number.parseInt(planSizeInput?.value || '5', 10) || 5),
        focuses: getCheckedMenuValues('menu-focus'),
        complexities: getCheckedMenuValues('menu-complexity'),
        fatigueLevels: getCheckedMenuValues('menu-fatigue'),
        difficultyLevels: getCheckedMenuValues('menu-difficulty')
    };
}

function intersects(values, selected) {
    if (!selected || selected.length === 0) return true;
    return values.some((item) => selected.includes(item));
}

function getFilteredMenuRows() {
    const filters = getMenuFiltersFromUI();
    return menuState.rows.filter((row) => {
        if (filters.maxPlayers && row.people_count && row.people_count > filters.maxPlayers) return false;
        if (filters.courtMode && !row.court_modes.includes(filters.courtMode)) return false;
        if (!intersects(row.focuses, filters.focuses)) return false;
        if (!intersects(row.complexities, filters.complexities)) return false;
        if (!intersects(row.fatigue_levels, filters.fatigueLevels)) return false;
        if (!intersects(row.difficulty_levels, filters.difficultyLevels)) return false;
        return true;
    });
}

function scoreMenuRow(row, filters) {
    let score = 0;
    score += row.focuses.filter((item) => filters.focuses.includes(item)).length * 5;
    score += row.complexities.filter((item) => filters.complexities.includes(item)).length * 2;
    score += row.fatigue_levels.filter((item) => filters.fatigueLevels.includes(item)).length * 2;
    score += row.difficulty_levels.filter((item) => filters.difficultyLevels.includes(item)).length * 2;
    if (filters.maxPlayers && row.people_count) {
        score += Math.max(0, 4 - Math.abs(filters.maxPlayers - row.people_count));
    }
    if (filters.courtMode && row.court_modes.includes(filters.courtMode)) {
        score += 2;
    }
    return score;
}

function pickRecommendedMenuRows(rows, filters) {
    const sortedRows = [...rows].sort((a, b) => {
        const scoreDiff = scoreMenuRow(b, filters) - scoreMenuRow(a, filters);
        if (scoreDiff !== 0) return scoreDiff;
        return sortMenuRows([a, b])[0] === a ? -1 : 1;
    });
    return sortedRows.slice(0, filters.planSize);
}

function getMenuCourtRank(courtModes) {
    const values = new Set(courtModes || []);
    if (values.has('有場') && !values.has('沒場')) return 0;
    if (values.has('有場') && values.has('沒場')) return 1;
    if (values.has('沒場')) return 2;
    return 3;
}

function getMenuDifficultyRank(difficultyLevels) {
    const rankMap = { '簡單': 0, '普通': 1, '困難': 2 };
    const ranks = (difficultyLevels || []).map((item) => rankMap[item]).filter((item) => Number.isFinite(item));
    return ranks.length ? Math.min(...ranks) : 99;
}

function sortMenuRows(rows) {
    return [...rows].sort((a, b) => {
        const courtDiff = getMenuCourtRank(a.court_modes) - getMenuCourtRank(b.court_modes);
        if (courtDiff !== 0) return courtDiff;
        const peopleDiff = (a.people_count || 999) - (b.people_count || 999);
        if (peopleDiff !== 0) return peopleDiff;
        const difficultyDiff = getMenuDifficultyRank(a.difficulty_levels) - getMenuDifficultyRank(b.difficulty_levels);
        if (difficultyDiff !== 0) return difficultyDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function renderMenuCard(row, index = null) {
    const badges = [
        `<span class="menu-badge">人數 ${escapeHtml(String(row.people_count || '-'))}</span>`,
        ...row.court_modes.map((item) => `<span class="menu-badge">${escapeHtml(item)}</span>`),
        ...row.complexities.map((item) => `<span class="menu-badge">${escapeHtml(item)}</span>`),
        ...row.fatigue_levels.map((item) => `<span class="menu-badge">${escapeHtml(item)}</span>`),
        ...row.difficulty_levels.map((item) => `<span class="menu-badge">${escapeHtml(item)}</span>`)
    ].join('');

    return `
        <article class="menu-result-card">
            <div class="menu-result-card__header">
                <div>
                    <div class="menu-result-card__eyebrow">${index === null ? '符合的訓練' : `訓練 ${index + 1}`}</div>
                    <h4>${escapeHtml(row.name)}</h4>
                </div>
                <div class="menu-result-card__badges">${badges}</div>
            </div>
            <div class="menu-result-card__meta">
                <div><strong>重點</strong><span>${escapeHtml(row.focuses.join(' / ') || '-')}</span></div>
            </div>
        </article>
    `;
}

function createPracticeMenuSourceItem(row, sourceLabel, sourceType) {
    const encodedName = encodeURIComponent(row.name || '');
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';
    return `
        <article class="menu-source-item" draggable="true" ondragstart="handlePracticeMenuDragStart(event, '${escapeHtml(sourceType)}', ${Number(row.id || 0)}, decodeURIComponent('${encodedName}'))">
            <div class="menu-source-item__main">
                <div class="menu-source-item__title">${escapeHtml(row.name)}</div>
                <div class="menu-source-item__meta">${escapeHtml((row.court_modes || []).join(' / ') || '-')} &middot; ${escapeHtml(String(row.people_count || '-'))} 人 &middot; ${escapeHtml((row.difficulty_levels || []).join(' / ') || '-')}</div>
            </div>
            <div class="menu-source-item__actions">
                <span class="menu-source-item__badge">${escapeHtml(sourceLabel)}</span>
                ${isCaptain ? `<button type="button" class="court-btn" onclick="addPracticeMenuItem('${sourceType}', ${Number(row.id || 0)}, decodeURIComponent('${encodedName}'), 'first_half')">+ 1st</button>` : ''}
                ${isCaptain ? `<button type="button" class="court-btn" onclick="addPracticeMenuItem('${sourceType}', ${Number(row.id || 0)}, decodeURIComponent('${encodedName}'), 'second_half')">+ 2nd</button>` : ''}
            </div>
        </article>
    `;
}

function renderPlanSources() {
    const resultContainer = document.getElementById('menu-result');
    if (!resultContainer) return;
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';

    if (!menuState.rows.length) {
        resultContainer.innerHTML = '<div class="menu-empty-state">找不到菜單資料庫，請確認 CSV 已成功匯入。</div>';
        return;
    }

    const generated = menuState.generatedRows || [];
    const matching = menuState.matchingRows || [];
    if (!generated.length && !matching.length) {
        resultContainer.innerHTML = '<div class="menu-empty-state">請先產生菜單或顯示符合項目，再拖曳到下方編排區。</div>';
        return;
    }

    resultContainer.innerHTML = `
        ${generated.length ? `
            <div class="menu-result-summary">
                <div>
                    <h4>系統建議菜單</h4>
                    ${isCaptain ? `<p>${escapeHtml(String(generated.length))} 個項目可拖曳</p>` : ''}
                </div>
            </div>
            <div class="menu-source-grid">
                ${generated.map((row) => createPracticeMenuSourceItem(row, '建議', 'generated')).join('')}
            </div>
        ` : ''}
        ${matching.length ? `
            <div class="menu-result-summary" style="margin-top:18px;">
                <div>
                    <h4>符合條件項目</h4>
                    ${isCaptain ? `<p>${escapeHtml(String(matching.length))} 個項目可拖曳</p>` : ''}
                </div>
            </div>
            <div class="menu-source-grid">
                ${matching.map((row) => createPracticeMenuSourceItem(row, '符合', 'match')).join('')}
            </div>
        ` : ''}
    `;
}

function createPracticeMenuBoardItem(item, halfKey, index) {
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';
    return `
        <div class="practice-menu-item">
            <span>${escapeHtml(item.name || '未命名訓練')}</span>
            ${isCaptain ? `<button type="button" class="practice-menu-item__remove" onclick="removePracticeMenuItem('${halfKey}', ${index})">&times;</button>` : ''}
        </div>
    `;
}

function getNextPracticeInfo(weekdays) {
    const normalized = (weekdays || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
    if (!normalized.length) return { date: '', weekday: '' };
    const today = new Date();
    const currentDay = today.getDay();
    let bestOffset = null;
    let bestDay = null;
    normalized.forEach((day) => {
        let offset = (day - currentDay + 7) % 7;
        if (bestOffset === null || offset < bestOffset) {
            bestOffset = offset;
            bestDay = day;
        }
    });
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + (bestOffset || 0));
    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDate.getDate()).padStart(2, '0');
    return {
        date: `${yyyy}-${mm}-${dd}`,
        weekday: Number.isInteger(bestDay) ? PRACTICE_WEEKDAY_NAMES[bestDay] : ''
    };
}

function renderPracticeWeekdayControls(weekdays) {
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';
    if (!isCaptain) return '';
    const selected = new Set((weekdays || []).map((value) => Number(value)));
    const nextPractice = getNextPracticeInfo([...selected]);
    const labels = [...selected].sort((a, b) => a - b).map((value) => PRACTICE_WEEKDAY_NAMES[value]).join(', ');
    const controls = PRACTICE_WEEKDAY_NAMES.map((label, index) => `
        <label class="court-weekday-option ${isCaptain ? '' : 'menu-weekday-option--readonly'}">
            <input type="checkbox" data-practice-weekday="${index}" ${selected.has(index) ? 'checked' : ''} ${isCaptain ? '' : 'disabled'}>
            ${label}
        </label>
    `).join('');
    return `
        <div class="practice-menu-board__controls">
            <div class="court-weekday-filter practice-weekday-filter">
                <span class="court-weekday-filter__label">星期</span>
                ${controls}
            </div>
        </div>
    `;
}

function renderPracticeWeekdayCard() {
    const container = document.getElementById('menu-practice-weekdays');
    if (!container) return;
    container.innerHTML = renderPracticeWeekdayControls(menuState.practiceMenu.weekdays || []);
}

function renderPracticeMenuBoard() {
    const container = document.getElementById('menu-practice-board');
    if (!container) return;
    const firstHalf = menuState.practiceMenu.first_half || [];
    const secondHalf = menuState.practiceMenu.second_half || [];
    const updatedAt = menuState.practiceMenu.updated_at || '';
    const weekdays = menuState.practiceMenu.weekdays || [];
    const nextPractice = getNextPracticeInfo(weekdays);
    const titleSuffix = nextPractice.date ? ` ${nextPractice.date.slice(5)}${nextPractice.weekday ? `(${nextPractice.weekday})` : ''}` : '';

    container.innerHTML = `
        <div class="practice-menu-board">
            <div class="strategy-panel-header practice-menu-board__summary">
                <div>
                    <h4 class="strategy-panel-title">本週菜單${escapeHtml(titleSuffix)}</h4>
                    <p>${updatedAt ? `更新日期：${escapeHtml(updatedAt)}` : '請在下方編排並發布本週練球菜單。'}</p>
                </div>
            </div>
            <div class="practice-menu-board__halves">
                <section class="practice-menu-board__half">
                    <div class="practice-menu-board__list">
                        ${firstHalf.length ? firstHalf.map((item, index) => createPracticeMenuBoardItem(item, 'first_half', index)).join('') : '<div class="menu-empty-state" style="margin-top:0;">目前沒有訓練。</div>'}
                    </div>
                </section>
                <section class="practice-menu-board__half">
                    <div class="practice-menu-board__list">
                        ${secondHalf.length ? secondHalf.map((item, index) => createPracticeMenuBoardItem(item, 'second_half', index)).join('') : '<div class="menu-empty-state" style="margin-top:0;">目前沒有訓練。</div>'}
                    </div>
                </section>
            </div>
        </div>
    `;
    renderPracticeMenuDropZones();
}

function generateMenu() {
    const filters = getMenuFiltersFromUI();
    const filteredRows = getFilteredMenuRows();
    const recommendedRows = pickRecommendedMenuRows(filteredRows, filters);
    menuState.matchingRows = filteredRows;
    menuState.generatedRows = recommendedRows;
    renderPlanSources();
}

function showAllMenuMatches() {
    const filteredRows = getFilteredMenuRows();
    menuState.matchingRows = filteredRows;
    renderPlanSources();
}

function resetMenuFilters() {
    const playersInput = document.getElementById('menu-players');
    const courtModeInput = document.getElementById('menu-court-mode');
    const planSizeInput = document.getElementById('menu-plan-size');

    if (playersInput) playersInput.value = 6;
    if (courtModeInput) courtModeInput.value = '';
    if (planSizeInput) planSizeInput.value = 5;

    document.querySelectorAll('#menu input[type="checkbox"]').forEach((input) => {
        input.checked = false;
    });

    generateMenu();
}

function toggleMenuEditor(forceState) {
    const nextState = typeof forceState === 'boolean' ? forceState : !menuState.editorOpen;
    menuState.editorOpen = nextState;
    const panel = document.getElementById('menu-editor-panel');
    const icon = document.getElementById('menu-editor-toggle-icon');
    if (panel) panel.style.display = nextState ? 'block' : 'none';
    if (icon) icon.textContent = nextState ? '▴' : '▾';
}

function renderPracticeMenuDropZoneItems(halfKey) {
    const items = menuState.practiceMenu[halfKey] || [];
    if (!items.length) {
        return '<div class="menu-drop-zone__empty">把菜單拖曳到這裡，或手動新增。</div>';
    }
    return items.map((item, index) => `
        <div class="menu-drop-zone__item" draggable="true" data-half-key="${halfKey}" data-index="${index}" ondragstart="handlePracticeMenuExistingDragStart(event, '${halfKey}', ${index})">
            <span>${escapeHtml(item.name || '未命名訓練')}</span>
            <button type="button" onclick="removePracticeMenuItem('${halfKey}', ${index})">&times;</button>
        </div>
    `).join('');
}

function getGoogleResourceKind(url) {
    const normalized = String(url || '').toLowerCase();
    if (normalized.includes('/spreadsheets/')) {
        return { label: 'Google 試算表', icon: 'fas fa-table', accentClass: 'resource-preview--sheet' };
    }
    if (normalized.includes('/document/')) {
        return { label: 'Google 文件', icon: 'fas fa-file-alt', accentClass: 'resource-preview--doc' };
    }
    return { label: 'Google 檔案', icon: 'fas fa-link', accentClass: 'resource-preview--file' };
}

function renderTeamResourceCard(item, sectionId) {
    const resourceKind = getGoogleResourceKind(item.url);
    const title = item.title && item.title.trim() ? item.title.trim() : resourceKind.label;
    return `
        <div class="video-card">
            ${isCaptainRole() ? `<button class="delete-btn" onclick="deleteTeamResourceItem('${item.id}', '${sectionId}')">刪除</button>` : ''}
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: inherit;">
                <div class="video-preview resource-preview ${resourceKind.accentClass}">
                    <i class="${resourceKind.icon}"></i>
                    <span>${resourceKind.label}</span>
                </div>
                <div class="video-info">
                    <h5>${escapeHtml(title)}</h5>
                    <p>${escapeHtml(item.url.length > 60 ? `${item.url.slice(0, 60)}...` : item.url)}</p>
                </div>
            </a>
        </div>
    `;
}

function renderPracticeMenuDropZones() {
    const firstZone = document.getElementById('menu-first-half-zone');
    const secondZone = document.getElementById('menu-second-half-zone');
    if (firstZone) firstZone.innerHTML = renderPracticeMenuDropZoneItems('first_half');
    if (secondZone) secondZone.innerHTML = renderPracticeMenuDropZoneItems('second_half');
    clearPracticeMenuDropIndicators();
}

async function savePracticeMenu() {
    await fetch('/api/practice_menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuState.practiceMenu)
    });
}

async function loadPracticeMenu() {
    try {
        const response = await fetch('/api/practice_menu');
        const data = await response.json();
        menuState.practiceMenu = {
            first_half: Array.isArray(data.first_half) ? data.first_half : [],
            second_half: Array.isArray(data.second_half) ? data.second_half : [],
            weekdays: Array.isArray(data.weekdays) ? data.weekdays : [],
            updated_at: data.updated_at || ''
        };
        renderPracticeMenuBoard();
        renderPracticeWeekdayCard();
    } catch (error) {
        console.error('Failed to load practice menu', error);
    }
}

async function addPracticeMenuItem(sourceType, sourceId, sourceName, halfKey) {
    const item = {
        source_type: sourceType,
        source_id: sourceId || null,
        name: sourceName || '未命名訓練'
    };
    menuState.practiceMenu[halfKey] = [...(menuState.practiceMenu[halfKey] || []), item];
    await savePracticeMenu();
    await loadPracticeMenu();
}

async function addManualPracticeMenuItem(halfKey) {
    const input = document.getElementById(halfKey === 'first_half' ? 'menu-first-half-manual' : 'menu-second-half-manual');
    const value = input?.value?.trim();
    if (!value) return;
    await addPracticeMenuItem('manual', null, value, halfKey);
    if (input) input.value = '';
}

async function removePracticeMenuItem(halfKey, index) {
    if (localStorage.getItem('vbt_role') !== 'captain') return;
    const nextItems = [...(menuState.practiceMenu[halfKey] || [])];
    nextItems.splice(index, 1);
    menuState.practiceMenu[halfKey] = nextItems;
    await savePracticeMenu();
    await loadPracticeMenu();
}

async function updatePracticeWeekdays() {
    const selected = Array.from(document.querySelectorAll('input[data-practice-weekday]:checked')).map((input) => Number(input.dataset.practiceWeekday));
    menuState.practiceMenu.weekdays = selected;
    await savePracticeMenu();
    await loadPracticeMenu();
}

function handlePracticeMenuDragStart(event, sourceType, sourceId, sourceName) {
    event.dataTransfer.setData('text/plain', JSON.stringify({
        drag_kind: 'source',
        source_type: sourceType,
        source_id: sourceId || null,
        name: sourceName || '未命名訓練'
    }));
}

function handlePracticeMenuExistingDragStart(event, halfKey, index) {
    const item = (menuState.practiceMenu[halfKey] || [])[index];
    if (!item) return;
    event.dataTransfer.setData('text/plain', JSON.stringify({
        drag_kind: 'existing',
        from_half: halfKey,
        from_index: index,
        item
    }));
}

function handlePracticeMenuDragOver(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    if (!zone) return;
    const insertIndex = getPracticeMenuInsertIndex(zone, event.clientY);
    updatePracticeMenuDropIndicator(zone, insertIndex);
}

async function handlePracticeMenuDrop(event, halfKey) {
    event.preventDefault();
    try {
        const zone = event.currentTarget;
        const insertIndex = getPracticeMenuInsertIndex(zone, event.clientY);
        const payload = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (payload.drag_kind === 'existing') {
            const fromHalf = payload.from_half;
            const fromIndex = Number(payload.from_index);
            const sourceItems = [...(menuState.practiceMenu[fromHalf] || [])];
            const [movedItem] = sourceItems.splice(fromIndex, 1);
            if (!movedItem) return;
            const targetItems = fromHalf === halfKey ? sourceItems : [...(menuState.practiceMenu[halfKey] || [])];
            const adjustedIndex = fromHalf === halfKey && fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
            const normalizedIndex = Math.max(0, Math.min(adjustedIndex, targetItems.length));
            targetItems.splice(normalizedIndex, 0, movedItem);
            menuState.practiceMenu[fromHalf] = sourceItems;
            menuState.practiceMenu[halfKey] = targetItems;
            await savePracticeMenu();
            await loadPracticeMenu();
            return;
        }
        const nextItems = [...(menuState.practiceMenu[halfKey] || [])];
        const normalizedIndex = Math.max(0, Math.min(insertIndex, nextItems.length));
        nextItems.splice(normalizedIndex, 0, {
            source_type: payload.source_type,
            source_id: payload.source_id || null,
            name: payload.name || '未命名訓練'
        });
        menuState.practiceMenu[halfKey] = nextItems;
        await savePracticeMenu();
        await loadPracticeMenu();
    } catch (error) {
        console.error('Failed to drop practice menu item', error);
    } finally {
        clearPracticeMenuDropIndicators();
    }
}

function getPracticeMenuInsertIndex(zone, clientY) {
    if (!zone) return 0;
    const items = Array.from(zone.querySelectorAll('.menu-drop-zone__item'));
    for (const item of items) {
        const rect = item.getBoundingClientRect();
        if (clientY < rect.top + (rect.height / 2)) {
            return Number(item.dataset.index || 0);
        }
    }
    return items.length;
}

function clearPracticeMenuDropIndicators() {
    document.querySelectorAll('.menu-drop-zone__item.drop-before, .menu-drop-zone__item.drop-after').forEach((item) => {
        item.classList.remove('drop-before', 'drop-after');
    });
    document.querySelectorAll('.menu-drop-zone.is-drop-target-empty').forEach((zone) => {
        zone.classList.remove('is-drop-target-empty');
    });
}

function updatePracticeMenuDropIndicator(zone, insertIndex) {
    clearPracticeMenuDropIndicators();
    if (!zone) return;
    const items = Array.from(zone.querySelectorAll('.menu-drop-zone__item'));
    if (!items.length) {
        zone.classList.add('is-drop-target-empty');
        return;
    }
    if (insertIndex >= items.length) {
        items[items.length - 1].classList.add('drop-after');
        return;
    }
    items[insertIndex].classList.add('drop-before');
}

function handlePracticeMenuDragLeave(event) {
    const zone = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (zone && relatedTarget && zone.contains(relatedTarget)) return;
    clearPracticeMenuDropIndicators();
}

function initPracticeWeekdayListeners() {
    document.addEventListener('change', async (event) => {
        const target = event.target;
        if (target && target.matches('input[data-practice-weekday]')) {
            await updatePracticeWeekdays();
        }
    });
}

function menuValuesToText(values) {
    return (values || []).join(', ');
}

function fillMenuEditor(row) {
    menuState.editingId = row?.id || null;
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };
    setValue('menu-edit-id', row?.id || '');
    setValue('menu-edit-name', row?.name || '');
    setValue('menu-edit-players', row?.people_count || 2);
    setValue('menu-edit-focuses', menuValuesToText(row?.focuses));
    setValue('menu-edit-court-modes', menuValuesToText(row?.court_modes));
    setValue('menu-edit-complexities', menuValuesToText(row?.complexities));
    setValue('menu-edit-fatigue', menuValuesToText(row?.fatigue_levels));
    setValue('menu-edit-difficulty', menuValuesToText(row?.difficulty_levels));
}

function resetMenuEditor() {
    fillMenuEditor(null);
}

function startCreateMenuItem() {
    resetMenuEditor();
    const nameInput = document.getElementById('menu-edit-name');
    if (nameInput) nameInput.focus();
}

function renderMenuEditorList() {
    const list = document.getElementById('menu-editor-list');
    if (!list) return;
    if (!menuState.rows.length) {
        list.innerHTML = '<div class="menu-empty-state" style="margin-top:0;">目前沒有訓練。</div>';
        return;
    }
    list.innerHTML = sortMenuRows(menuState.rows).map((row) => `
        <button type="button" class="menu-editor-item ${menuState.editingId === row.id ? 'active' : ''}" onclick="fillMenuEditorById(${row.id})">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${escapeHtml((row.court_modes || []).join(' / ') || '-')} &middot; ${escapeHtml(String(row.people_count || '-'))} 人 &middot; ${escapeHtml((row.difficulty_levels || []).join(' / ') || '-')}</span>
        </button>
    `).join('');
}

function fillMenuEditorById(itemId) {
    const row = menuState.rows.find((item) => item.id === itemId);
    if (!row) return;
    fillMenuEditor(row);
    renderMenuEditorList();
}

function collectMenuEditorPayload() {
    return {
        name: document.getElementById('menu-edit-name')?.value || '',
        people_count: document.getElementById('menu-edit-players')?.value || 0,
        focuses: document.getElementById('menu-edit-focuses')?.value || '',
        court_modes: document.getElementById('menu-edit-court-modes')?.value || '',
        complexities: document.getElementById('menu-edit-complexities')?.value || '',
        fatigue_levels: document.getElementById('menu-edit-fatigue')?.value || '',
        difficulty_levels: document.getElementById('menu-edit-difficulty')?.value || ''
    };
}

function ensureMenuEditorActionsPlacement() {
    const actionRow = document.querySelector('#menu-editor-panel .menu-editor-actions');
    const layout = document.querySelector('#menu-editor-panel .menu-editor-layout');
    if (!actionRow || !layout) return;
    if (actionRow.nextElementSibling !== layout) {
        layout.parentElement.insertBefore(actionRow, layout);
    }
}

function setMenuImportStatus(message, type = '') {
    const status = document.getElementById('menu-import-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.remove('is-error', 'is-success');
    if (type === 'error') status.classList.add('is-error');
    if (type === 'success') status.classList.add('is-success');
}

async function importMenuCsv() {
    const fileInput = document.getElementById('menu-import-file');
    const replaceInput = document.getElementById('menu-import-replace');
    const file = fileInput?.files?.[0];

    if (!file) {
        setMenuImportStatus('請先選擇 CSV 檔案。', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('replace', replaceInput?.checked ? 'true' : 'false');

    setMenuImportStatus('CSV 匯入中...');

    try {
        const response = await fetch('/api/menu_data/import', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (!response.ok) {
            setMenuImportStatus(data.error || 'CSV 匯入失敗。', 'error');
            return;
        }

        if (fileInput) fileInput.value = '';
        if (replaceInput) replaceInput.checked = false;
        resetMenuEditor();
        await refreshMenuData(false);
        generateMenu();
        setMenuImportStatus(`已從 ${data.filename || 'CSV'} 匯入 ${data.count || 0} 筆菜單。`, 'success');
    } catch (error) {
        console.error('Failed to import menu CSV', error);
        setMenuImportStatus('CSV 匯入失敗。', 'error');
    }
}

async function refreshMenuData(preserveEditor = true) {
    const response = await fetch('/api/menu_data');
    const data = await response.json();
    menuState.rows = Array.isArray(data.rows) ? data.rows : [];
    menuState.filters = data.filters || menuState.filters;
    renderMenuFilterOptions(menuState.filters);
    renderMenuEditorList();
    if (preserveEditor && menuState.editingId) {
        const current = menuState.rows.find((item) => item.id === menuState.editingId);
        if (current) fillMenuEditor(current);
        else resetMenuEditor();
    }
    return data;
}

async function saveMenuItem() {
    const payload = collectMenuEditorPayload();
    const itemId = document.getElementById('menu-edit-id')?.value;
    const method = itemId ? 'PUT' : 'POST';
    const url = itemId ? `/api/menu_data/${itemId}` : '/api/menu_data';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '儲存菜單失敗。');
            return;
        }
        menuState.editingId = data.item?.id || null;
        await refreshMenuData(true);
        generateMenu();
    } catch (error) {
        console.error('Failed to save menu item', error);
        alert('儲存菜單失敗。');
    }
}

async function deleteMenuItem() {
    const itemId = document.getElementById('menu-edit-id')?.value;
    if (!itemId) {
        alert('請先選擇要刪除的菜單。');
        return;
    }
    if (!confirm('確定要從菜單資料庫刪除這個菜單嗎？')) return;

    try {
        const response = await fetch(`/api/menu_data/${itemId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '刪除菜單失敗。');
            return;
        }
        resetMenuEditor();
        await refreshMenuData(false);
        generateMenu();
    } catch (error) {
        console.error('Failed to delete menu item', error);
        alert('刪除菜單失敗。');
    }
}

async function initTrainingMenu() {
    const resultContainer = document.getElementById('menu-result');
    await loadPracticeMenu();
    ensureMenuEditorActionsPlacement();
    if (resultContainer) {
        resultContainer.innerHTML = '<div class="menu-empty-state">菜單資料庫載入中...</div>';
    }

    try {
        const data = await refreshMenuData(false);
        resetMenuEditor();
        toggleMenuEditor(false);
        initMenuFilterAutoRefresh();

        if (!menuState.rows.length && resultContainer) {
            resultContainer.innerHTML = '<div class="menu-empty-state">找不到菜單資料庫，請先匯入 CSV。</div>';
            return;
        }

        generateMenu();
    } catch (error) {
        console.error('Failed to load training menu', error);
        if (resultContainer) {
            resultContainer.innerHTML = '<div class="menu-empty-state">菜單資料庫載入失敗。</div>';
        }
    }
}

function runTask(taskName) {
    console.log(`Task triggered: ${taskName}`);
    alert(`系統通知：正在執行 "${taskName}"。\n(目前僅具備介面。)`);
}

function addAdvancedRecord() {
    alert('紀錄儲存成功。');
}
// ==========================================
// 6. Court Status & Scraper Management (融合升級版)
// ==========================================

function getMonthData(offsetMonth = 0) {
    const date = new Date();
    date.setMonth(date.getMonth() + offsetMonth);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return { id: `${yyyy}-${mm}`, displayNumber: date.getMonth() + 1, year: yyyy, label: `${yyyy}-${mm}` };
}

const COURT_WEEKDAY_KEY = 'vbt_court_weekdays';
const COURT_WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const courtStatusCache = {};
const courtEditState = {
    active: false,
    monthId: null,
    draftRows: []
};
let activeCourtTab = 'current';

function getDefaultCourtWeekdays() {
    return [0, 1, 2, 3, 4, 5, 6];
}

function getSelectedCourtWeekdays() {
    const checkboxes = document.querySelectorAll('[data-court-weekday]');
    if (checkboxes.length > 0) {
        const selected = Array.from(checkboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => Number(checkbox.dataset.courtWeekday));
        return selected.length > 0 ? selected : getDefaultCourtWeekdays();
    }

    try {
        const saved = JSON.parse(localStorage.getItem(COURT_WEEKDAY_KEY) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            return saved.map(Number);
        }
    } catch (error) {
        console.warn('Failed to read saved court weekdays', error);
    }

    return getDefaultCourtWeekdays();
}

function initCourtWeekdayFilters() {
    const checkboxes = document.querySelectorAll('[data-court-weekday]');
    if (checkboxes.length === 0) return;

    let selectedWeekdays = getDefaultCourtWeekdays();
    try {
        const saved = JSON.parse(localStorage.getItem(COURT_WEEKDAY_KEY) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            selectedWeekdays = saved.map(Number);
        }
    } catch (error) {
        console.warn('Failed to parse saved court weekdays', error);
    }

    checkboxes.forEach(checkbox => {
        checkbox.checked = selectedWeekdays.includes(Number(checkbox.dataset.courtWeekday));
        checkbox.addEventListener('change', () => {
            const selected = Array.from(checkboxes)
                .filter(item => item.checked)
                .map(item => Number(item.dataset.courtWeekday));

            if (selected.length === 0) {
                checkbox.checked = true;
                return;
            }

            localStorage.setItem(COURT_WEEKDAY_KEY, JSON.stringify(selected));
            loadCourtStatus();
        });
    });
}

function normalizeCourtDateValue(dateValue) {
    if (!dateValue) return '';
    const match = String(dateValue).match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
}

function formatCourtDateLabel(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} (${COURT_WEEKDAY_NAMES[dateObj.getDay()]})`;
}

function buildCourtCalendarRows(monthId, data) {
    return buildCourtCalendarRowsWithWeekdays(monthId, data, getSelectedCourtWeekdays());
}

function buildCourtCalendarRowsWithWeekdays(monthId, data, weekdays) {
    const selectedWeekdays = new Set(weekdays);
    const [year, month] = monthId.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dataMap = new Map();

    (Array.isArray(data) ? data : []).forEach(row => {
        const normalizedDate = normalizeCourtDateValue(row.date);
        if (!normalizedDate) return;
        dataMap.set(normalizedDate, row);
    });

    const rows = [];
    for (let day = 1; day <= lastDay; day++) {
        const dateObj = new Date(year, month - 1, day);
        if (!selectedWeekdays.has(dateObj.getDay())) continue;

        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const existingRow = dataMap.get(dateKey);

        rows.push({
            date: formatCourtDateLabel(dateObj),
            slot1: existingRow ? existingRow.slot1 : null,
            slot2: existingRow ? existingRow.slot2 : null
        });
    }

    return rows;
}

function cloneCourtRows(rows) {
    return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function simplifyCourtName(value) {
    return String(value ?? '').replace(/Volleyball\s+Court/gi, 'Court').trim();
}

function normalizeCourtSlot(slotData) {
    if (!slotData) return null;

    const line1 = simplifyCourtName((slotData.line1 ?? slotData.court ?? '').toString().trim());
    const line2 = (slotData.line2 ?? slotData.dept ?? '').toString().trim();
    const color = slotData.color === 'blue' ? 'blue' : slotData.color === 'yellow' ? 'yellow' : 'none';

    if (!line1 && !line2 && color === 'none') return null;

    return { line1, line2, color };
}

function normalizeCourtRow(row) {
    return {
        date: row.date,
        slot1: normalizeCourtSlot(row.slot1),
        slot2: normalizeCourtSlot(row.slot2)
    };
}

function getCourtMonthDataById(monthId) {
    const now = getMonthData(0);
    if (now.id === monthId) return now;

    const next = getMonthData(1);
    if (next.id === monthId) return next;

    const [year, month] = monthId.split('-').map(Number);
    return { id: monthId, displayNumber: month, year };
}

function getActiveCourtMonthId() {
    return activeCourtTab === 'next' ? getMonthData(1).id : getMonthData(0).id;
}

function updateCourtEditButton() {
    const editBtn = document.getElementById('edit-table-btn');
    if (!editBtn) return;
    if (activeCourtTab === 'saved') {
        editBtn.style.display = 'none';
        return;
    }
    editBtn.style.display = 'inline-flex';

    const isEditingActiveTab = courtEditState.active && courtEditState.monthId === getActiveCourtMonthId();
    editBtn.innerHTML = isEditingActiveTab
        ? '<i class="fas fa-times"></i> 取消編輯'
        : '<i class="fas fa-edit"></i> 編輯表格';
}

function getCourtRowsForMonth(monthId, visibleOnly = true) {
    const cache = courtStatusCache[monthId];
    if (!cache) return [];
    return visibleOnly ? cache.visibleRows : cache.allRows;
}

function getCourtDraftRows(monthId, visibleOnly = true) {
    const sourceRows = courtEditState.active && courtEditState.monthId === monthId
        ? courtEditState.draftRows
        : getCourtRowsForMonth(monthId, false);

    if (!visibleOnly) return sourceRows;

    const selectedWeekdays = new Set(getSelectedCourtWeekdays());
    return sourceRows.filter(row => {
        const dateValue = normalizeCourtDateValue(row.date);
        if (!dateValue) return true;
        return selectedWeekdays.has(new Date(`${dateValue}T00:00:00`).getDay());
    });
}

function setCourtCache(monthId, rows) {
    const normalizedRows = rows.map(normalizeCourtRow);
    courtStatusCache[monthId] = {
        allRows: normalizedRows,
        visibleRows: buildCourtCalendarRowsWithWeekdays(monthId, normalizedRows, getSelectedCourtWeekdays())
    };
}

function refreshCourtTableByMonth(monthId) {
    const current = getMonthData(0);
    const next = getMonthData(1);

    if (monthId === current.id) {
        renderCourtTable(current.id, 'display-current');
    } else if (monthId === next.id) {
        renderCourtTable(next.id, 'display-next');
    }
}

function getCourtCellClass(slotData) {
    if (!slotData) return 'court-empty';
    if (slotData.color === 'blue') return 'court-booked court-booked--blue';
    if (slotData.color === 'yellow') return 'court-booked court-booked--yellow';
    return 'court-empty';
}

function renderCourtSlotDisplay(slotData, isAuth) {
    const normalized = normalizeCourtSlot(slotData);
    if (!normalized) return `<td class="court-empty">-</td>`;

    let content = `<div class="slot-line1">${escapeHtml(normalized.line1)}</div>`;
    const showLine2 = isAuth && normalized.line2;
    if (showLine2) {
        content += `<div class="dept-name slot-line2">${escapeHtml(normalized.line2)}</div>`;
    }

    return `<td class="${getCourtCellClass(normalized)}">${content}</td>`;
}

async function loadCourtStatus() {
    const current = getMonthData(0);
    const next = getMonthData(1);

    const labelCur = document.getElementById('label-current-month');
    const labelNext = document.getElementById('label-next-month');
    if (labelCur) labelCur.innerText = current.label;
    if (labelNext) labelNext.innerText = next.label;

    await fetchAndDisplayCourt(current.id, 'display-current');
    await fetchAndDisplayCourt(next.id, 'display-next');
    updateCourtEditButton();
}

async function deleteMonthRecords(monthId) {
    if (!monthId) return;
    if (!confirm(`確定要刪除 ${monthId} 的全部已儲存資料嗎？這會一併移除場地狀態、投籤紀錄與歷史分析。`)) return;

    try {
        const response = await fetch(`/api/court_status/${monthId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '刪除儲存月份失敗。');
            return;
        }

        await loadCourtStatus();
        if (typeof loadLotteryDashboard === 'function') {
            await loadLotteryDashboard();
        }
        if (typeof loadLotteryMonthHistory === 'function') {
            await loadLotteryMonthHistory();
        }
    } catch (error) {
        console.error('Failed to delete saved month', error);
        alert('刪除儲存月份失敗。');
    }
}

async function deleteCourtOnlyMonth(monthId) {
    if (!monthId) return;
    if (!confirm(`確定要刪除 ${monthId} 的場地狀態資料嗎？投籤紀錄會保留。`)) return;
    try {
        const response = await fetch(`/api/court_status/${monthId}?scope=court`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '刪除場地狀態資料失敗。');
            return;
        }
        await loadCourtStatus();
        if (typeof loadLotteryDashboard === 'function') await loadLotteryDashboard();
        if (typeof loadLotteryMonthHistory === 'function') await loadLotteryMonthHistory();
    } catch (error) {
        console.error('Failed to delete court-only month', error);
        alert('刪除場地狀態資料失敗。');
    }
}

async function deleteBidOnlyMonth(monthId) {
    if (!monthId) return;
    if (!confirm(`確定要刪除 ${monthId} 的投籤資料嗎？場地狀態會保留。`)) return;
    try {
        const response = await fetch(`/api/lottery_bids/${monthId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '刪除投籤資料失敗。');
            return;
        }
        await loadCourtStatus();
        if (typeof loadLotteryDashboard === 'function') await loadLotteryDashboard();
        if (typeof loadLotteryMonthHistory === 'function') await loadLotteryMonthHistory();
    } catch (error) {
        console.error('Failed to delete bid-only month', error);
        alert('刪除投籤資料失敗。');
    }
}

function transformCourtData(rawData) {
    if (!Array.isArray(rawData)) return [];
    if (rawData.length === 0) return [];

    if (rawData[0].slot1 !== undefined && typeof rawData[0].slot1 === 'object') {
        return rawData.map(normalizeCourtRow);
    }

    if ('slot1_court' in rawData[0] || 'slot1_name' in rawData[0]) {
        return rawData.map(row => ({
            date: row.date || row.Date,
            slot1: normalizeCourtSlot((row.slot1_court || row.slot1_name) ? {
                line1: row.slot1_court || row.slot1_name,
                line2: row.slot1_dept || '',
                color: 'yellow'
            } : null),
            slot2: normalizeCourtSlot((row.slot2_court || row.slot2_name) ? {
                line1: row.slot2_court || row.slot2_name,
                line2: row.slot2_dept || '',
                color: 'yellow'
            } : null)
        }));
    }

    const grouped = {};
    rawData.forEach(item => {
        const d = item.date || item.Date;
        if (!d) return;

        if (!grouped[d]) {
            grouped[d] = { date: d, slot1: null, slot2: null };
        }

        const time = (item.time || item.Time || '').toString();
        const court = item.court || item.Court || item.court_name || '';
        const dept = item.dept || item.Dept || item.department || item['Booked By'] || '';
        if (!court) return;

        const courtInfo = normalizeCourtSlot({
            line1: court,
            line2: dept,
            color: 'yellow'
        });

        if (time.includes('18') || time.includes('19')) {
            grouped[d].slot1 = courtInfo;
        } else if (time.includes('20') || time.includes('21')) {
            grouped[d].slot2 = courtInfo;
        }
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchAndDisplayCourt(monthId, elementId) {
    try {
        const response = await fetch(`/api/court_status/${monthId}`);
        const responseData = await response.json();
        let rawData = responseData.drawresult || responseData.data || responseData;

        if (rawData.content && typeof rawData.content === 'string') {
            try { rawData = JSON.parse(rawData.content); } catch (e) {}
        } else if (typeof rawData === 'string') {
            try { rawData = JSON.parse(rawData); } catch (e) {}
        }

        const formattedData = transformCourtData(rawData);
        const completedData = buildCourtCalendarRowsWithWeekdays(monthId, formattedData, getDefaultCourtWeekdays());
        setCourtCache(monthId, completedData);
        renderCourtTable(monthId, elementId);
    } catch (error) {
        console.error(`Failed to load court status for ${monthId}`, error);
        const displayDiv = document.getElementById(elementId);
        if (displayDiv) displayDiv.innerHTML = '<p style="color:red; text-align:center;">載入資料失敗。</p>';
    }
}

function renderCourtTable(monthId, containerId) {
    const role = localStorage.getItem('vbt_role');
    const isAuth = role === 'member' || role === 'captain';
    const isEditing = courtEditState.active && courtEditState.monthId === monthId;
    const tableData = getCourtDraftRows(monthId, true);
    const monthData = getCourtMonthDataById(monthId);

    let html = '';

    if (isAuth) {
        html += `
            <div class="court-controls">
                ${isEditing ? `
                    <button class="court-btn" onclick="saveCourtStatus()">儲存表格</button>
                    <button class="court-btn" onclick="toggleEditMode(false)">取消編輯</button>
                ` : `
                    <button class="court-btn" onclick="toggleNames()">隱藏 / 顯示名稱</button>
                    <button class="court-btn" onclick="downloadCourtTableAsPng('${monthId}')">下載 PNG</button>
                `}
            </div>
        `;
    }

    html += `
        <div class="court-dashboard-container" data-court-month="${monthId}">
            <div class="court-export-title">場地狀態 ${monthData.id}</div>
            <table class="court-table">
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>18:00 - 20:00</th>
                        <th>20:00 - 22:00</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (tableData.length === 0) {
        html += `<tr><td colspan="3" style="color:#999; padding: 20px;">目前沒有場地資料。</td></tr>`;
    } else {
        tableData.forEach((row) => {
            html += `<tr><td><strong>${row.date}</strong></td>`;
            html += isEditing
                ? renderCourtSlotEditor(row.slot1, row.date, 'slot1')
                : renderCourtSlotDisplay(row.slot1, isAuth);
            html += isEditing
                ? renderCourtSlotEditor(row.slot2, row.date, 'slot2')
                : renderCourtSlotDisplay(row.slot2, isAuth);
            html += `</tr>`;
        });
    }

    html += `</tbody></table></div>`;

    const displayDiv = document.getElementById(containerId);
    if (displayDiv) displayDiv.innerHTML = html;
}

function toggleNames() {
    const names = document.querySelectorAll('.slot-line2');
    names.forEach(name => {
        name.style.display = name.style.display === 'none' ? 'block' : 'none';
    });
}

function switchCourtTab(tabType) {
    activeCourtTab = tabType;
    document.getElementById('tab-current').classList.remove('active');
    document.getElementById('tab-next').classList.remove('active');
    document.getElementById(`tab-${tabType}`).classList.add('active');

    document.getElementById('display-current').style.display = tabType === 'current' ? 'block' : 'none';
    document.getElementById('display-next').style.display = tabType === 'next' ? 'block' : 'none';
    updateCourtEditButton();
}

function toggleEditMode(forceState) {
    const monthId = getActiveCourtMonthId();
    const shouldEnable = typeof forceState === 'boolean'
        ? forceState
        : !(courtEditState.active && courtEditState.monthId === monthId);

    if (shouldEnable) {
        courtEditState.active = true;
        courtEditState.monthId = monthId;
        courtEditState.draftRows = cloneCourtRows(getCourtRowsForMonth(monthId, false));
    } else {
        courtEditState.active = false;
        courtEditState.monthId = null;
        courtEditState.draftRows = [];
    }

    refreshCourtTableByMonth(monthId);
    updateCourtEditButton();
}

async function saveCourtStatus() {
    if (!courtEditState.active || !courtEditState.monthId) return;

    const monthId = courtEditState.monthId;
    const sanitizedRows = courtEditState.draftRows.map(normalizeCourtRow);

    try {
        const response = await fetch('/api/court_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                month_id: monthId,
                content: JSON.stringify(sanitizedRows)
            })
        });

        if (response.ok) {
            setCourtCache(monthId, sanitizedRows);
            courtEditState.active = false;
            courtEditState.monthId = null;
            courtEditState.draftRows = [];
            refreshCourtTableByMonth(monthId);
            updateCourtEditButton();
            alert(`${monthId} 的場地狀態已成功儲存。`);
        }
    } catch (error) {
        console.error('Error saving court status', error);
    }
}

function updateCourtCell(rowDate, slotKey, field, value) {
    if (!courtEditState.active) return;

    const row = courtEditState.draftRows.find(item => item.date === rowDate);
    if (!row) return;

    const currentSlot = normalizeCourtSlot(row[slotKey]) || {
        line1: '',
        line2: '',
        color: 'none'
    };

    currentSlot[field] = value;
    row[slotKey] = normalizeCourtSlot(currentSlot);
}

function renderCourtSlotEditor(slotData, rowDate, slotKey) {
    const normalized = normalizeCourtSlot(slotData) || { line1: '', line2: '', color: 'none' };

    return `
        <td class="${getCourtCellClass(normalized)} court-edit-cell">
            <div class="court-edit-field">
                <label>顏色</label>
                <select onchange="updateCourtCell('${rowDate}', '${slotKey}', 'color', this.value)">
                    <option value="none" ${normalized.color === 'none' ? 'selected' : ''}>無色</option>
                    <option value="yellow" ${normalized.color === 'yellow' ? 'selected' : ''}>黃色</option>
                    <option value="blue" ${normalized.color === 'blue' ? 'selected' : ''}>藍色</option>
                </select>
            </div>
            <div class="court-edit-field">
                <label>第一行</label>
                <input type="text" value="${escapeHtml(normalized.line1)}" placeholder="場 4, 5, 6, 7" oninput="updateCourtCell('${rowDate}', '${slotKey}', 'line1', this.value)">
            </div>
            <div class="court-edit-field">
                <label>第二行</label>
                <input type="text" value="${escapeHtml(normalized.line2)}" placeholder="預約系所或紀錄" oninput="updateCourtCell('${rowDate}', '${slotKey}', 'line2', this.value)">
            </div>
        </td>
    `;
}

async function downloadCourtTableAsPng(monthId) {
    const target = document.querySelector(`.court-dashboard-container[data-court-month="${monthId}"]`);
    if (!target) return;

    if (typeof html2canvas !== 'function') {
        alert('下載為 PNG 需要載入 html2canvas。');
        return;
    }

    try {
        const canvas = await html2canvas(target, {
            backgroundColor: null,
            scale: Math.max(window.devicePixelRatio || 1, 2),
            useCORS: true
        });

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `court-status-${monthId}.png`;
        link.click();
    } catch (error) {
        console.error('Failed to export court table as PNG', error);
        alert('匯出 PNG 失敗，請再試一次。');
    }
}

async function executeScraper(buttonEl) {
    const startEl = document.getElementById('config-start');
    const endEl = document.getElementById('config-end');
    const ignoreEl = document.getElementById('config-ignore-res');
    const swapInEl = document.getElementById('config-swap-in');
    const swapOutEl = document.getElementById('config-swap-out');

    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';
    const ignoreRes = ignoreEl ? ignoreEl.checked : false;
    const monthId = startDate ? startDate.substring(0, 7) : '';

    const swapInRaw = swapInEl ? swapInEl.value : '';
    const swapOutRaw = swapOutEl ? swapOutEl.value : '';
    const swapIn = swapInRaw ? swapInRaw.split(',').map(s => s.trim()) : [];
    const swapOut = swapOutRaw ? swapOutRaw.split(',').map(s => s.trim()) : [];

    if (!startDate || !endDate) {
        alert('請選擇開始與結束日期。');
        return;
    }

    if (!confirm(`確定要執行 ${startDate} 到 ${endDate} 的爬蟲嗎？`)) return;

    const btn = buttonEl && buttonEl.tagName === 'BUTTON' ? buttonEl : null;
    const labelEl = btn ? btn.querySelector('.scraper-btn-label') : null;
    const originalText = labelEl ? labelEl.innerText : '執行爬蟲';
    if (btn) {
        if (labelEl) labelEl.innerText = '爬取中';
        btn.disabled = true;
    }

    try {
        const response = await fetch('/api/trigger_scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                month_id: monthId,
                start_date: startDate,
                end_date: endDate,
                ignore_reservation: ignoreRes,
                swap_in: swapIn,
                swap_out: swapOut
            })
        });

        await response.json();
        await pollScrapeStatus(monthId);
    } catch (error) {
        console.error('Error triggering scraper', error);
        alert('爬蟲執行失敗，請檢查主控台。');
    } finally {
        if (btn) {
            if (labelEl) labelEl.innerText = originalText;
            btn.disabled = false;
        }
    }
}

async function pollScrapeStatus(targetMonth, maxAttempts = 20) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            const response = await fetch('/api/scrape_status');
            const data = await response.json();

            if (data.target_month && targetMonth && data.target_month !== targetMonth) {
                continue;
            }

            if (data.status === 'error') {
                alert(data.message || '系統拒絕存取。請登入台大場地系統後，再試著重新爬取。');
                return;
            }

            if (data.status === 'success') {
                await loadCourtStatus();
                return;
            }
        } catch (error) {
            console.error('Error polling scrape status', error);
            return;
        }
    }
}

function fillScrapeDateRange(monthOffset) {
    const today = new Date();
    const rangeStart = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0);

    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    document.getElementById('config-start').value = formatDate(rangeStart);
    document.getElementById('config-end').value = formatDate(rangeEnd);
}

function scrapeThisMonth() {
    fillScrapeDateRange(0);
}

function scrapeNextMonth() {
    fillScrapeDateRange(1);
}


const LOTTERY_WEEKDAY_KEY = 'vbt_lottery_weekdays';
const PROBABILITY_WEEKDAY_KEY = 'vbt_probability_weekdays';
const STRATEGY_WEEKDAY_KEY = 'vbt_strategy_weekdays';
const PROBABILITY_COURT_KEY = 'vbt_probability_courts';
const STRATEGY_COURT_KEY = 'vbt_strategy_courts';
const LOTTERY_COURTS = ['Court 4', 'Court 5', 'Court 6', 'Court 7'];
const LOTTERY_WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
const lotteryBidsCache = {};
const lotteryEditState = {
    active: false,
    monthId: null,
    draftRows: []
};
let activeLotteryTab = 'current';
let activeProbabilityTab = 'selected';
let activeStrategyTab = 'selected';
let lotterySelectedMonthId = getMonthData(0).id;

function initCheckboxFilter(selector, storageKey, defaultValues, valueGetter, onChange) {
    const checkboxes = document.querySelectorAll(selector);
    if (checkboxes.length === 0) return;

    let selectedValues = defaultValues;
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            selectedValues = saved;
        }
    } catch (error) {
        console.warn(`Failed to parse ${storageKey}`, error);
    }

    checkboxes.forEach((checkbox) => {
        const value = valueGetter(checkbox);
        checkbox.checked = selectedValues.includes(value);
        checkbox.addEventListener('change', () => {
            const selected = Array.from(checkboxes)
                .filter((item) => item.checked)
                .map((item) => valueGetter(item));

            if (selected.length === 0) {
                checkbox.checked = true;
                return;
            }

            localStorage.setItem(storageKey, JSON.stringify(selected));
            onChange();
        });
    });
}

function getStoredCheckboxValues(selector, storageKey, defaultValues, valueGetter) {
    const checkboxes = document.querySelectorAll(selector);
    if (checkboxes.length > 0) {
        const selected = Array.from(checkboxes)
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => valueGetter(checkbox));
        return selected.length > 0 ? selected : defaultValues;
    }

    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            return saved;
        }
    } catch (error) {
        console.warn(`Failed to read ${storageKey}`, error);
    }

    return defaultValues;
}

function getDefaultLotteryWeekdays() {
    return [0, 1, 2, 3, 4, 5, 6];
}

function getDefaultStrategyWeekdays() {
    return [1, 3];
}

function getSelectedLotteryWeekdays() {
    return getStoredCheckboxValues('[data-lottery-weekday]', LOTTERY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.lotteryWeekday));
}

function getSelectedProbabilityWeekdays() {
    return getStoredCheckboxValues('[data-probability-weekday]', PROBABILITY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.probabilityWeekday));
}

function getSelectedStrategyWeekdays() {
    return getStoredCheckboxValues('[data-strategy-weekday]', STRATEGY_WEEKDAY_KEY, getDefaultStrategyWeekdays(), (checkbox) => Number(checkbox.dataset.strategyWeekday));
}

function getSelectedProbabilityCourts() {
    return getStoredCheckboxValues('[data-probability-court]', PROBABILITY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.probabilityCourt);
}

function getSelectedStrategyCourts() {
    return getStoredCheckboxValues('[data-strategy-court]', STRATEGY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.strategyCourt);
}

function lotteryWeekdayIndex(dateValue) {
    const jsDay = new Date(`${dateValue}T00:00:00`).getDay();
    return (jsDay + 6) % 7;
}

function initLotteryWeekdayFilters() {
    initCheckboxFilter('[data-lottery-weekday]', LOTTERY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.lotteryWeekday), () => {
        loadLotteryBids();
        loadLotteryDashboard();
    });
    initCheckboxFilter('[data-probability-weekday]', PROBABILITY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.probabilityWeekday), loadLotteryDashboard);
    initCheckboxFilter('[data-strategy-weekday]', STRATEGY_WEEKDAY_KEY, getDefaultStrategyWeekdays(), (checkbox) => Number(checkbox.dataset.strategyWeekday), loadLotteryDashboard);
    initCheckboxFilter('[data-probability-court]', PROBABILITY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.probabilityCourt, loadLotteryDashboard);
    initCheckboxFilter('[data-strategy-court]', STRATEGY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.strategyCourt, loadLotteryDashboard);
}

function normalizeLotterySlot(slotData) {
    const normalized = {};
    LOTTERY_COURTS.forEach((court) => {
        const rawValue = slotData && Object.prototype.hasOwnProperty.call(slotData, court) ? slotData[court] : 0;
        normalized[court] = Math.max(0, Math.min(5, Number.parseInt(rawValue, 10) || 0));
    });
    return normalized;
}

function normalizeLotteryRow(row) {
    const normalizedDate = normalizeCourtDateValue(row.date);
    
    const dateObj = new Date(normalizedDate);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekdayStr = weekdays[dateObj.getDay()];

    return {
        date: normalizedDate,
        weekday: weekdayStr,
        slot1: normalizeLotterySlot(row.slot1 || {}),
        slot2: normalizeLotterySlot(row.slot2 || {})
    };
}

function cloneLotteryRows(rows) {
    return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
}

function formatLotteryDateLabel(dateValue) {
    return `${dateValue} (${LOTTERY_WEEKDAY_NAMES[lotteryWeekdayIndex(dateValue)]})`;
}

function buildLotteryCalendarRowsWithWeekdays(monthId, data, weekdays) {
    const selectedWeekdays = new Set(weekdays);
    const [year, month] = monthId.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dataMap = new Map();

    (Array.isArray(data) ? data : []).forEach((row) => {
        const normalizedDate = normalizeCourtDateValue(row.date);
        if (!normalizedDate) return;
        dataMap.set(normalizedDate, normalizeLotteryRow(row));
    });

    const rows = [];
    for (let day = 1; day <= lastDay; day++) {
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (!selectedWeekdays.has(lotteryWeekdayIndex(dateKey))) continue;
        const existingRow = dataMap.get(dateKey);
        rows.push({
            date: formatLotteryDateLabel(dateKey),
            slot1: existingRow ? existingRow.slot1 : normalizeLotterySlot({}),
            slot2: existingRow ? existingRow.slot2 : normalizeLotterySlot({})
        });
    }
    return rows;
}

function setLotteryCache(monthId, rows) {
    const normalizedRows = rows.map(normalizeLotteryRow);
    lotteryBidsCache[monthId] = {
        allRows: normalizedRows,
        visibleRows: buildLotteryCalendarRowsWithWeekdays(monthId, normalizedRows, getSelectedLotteryWeekdays())
    };
}

function getLotteryRowsForMonth(monthId, visibleOnly = true) {
    const cache = lotteryBidsCache[monthId];
    if (!cache) return [];
    return visibleOnly ? cache.visibleRows : cache.allRows;
}

function getLotteryDraftRows(monthId, visibleOnly = true) {
    const sourceRows = lotteryEditState.active && lotteryEditState.monthId === monthId
        ? lotteryEditState.draftRows
        : getLotteryRowsForMonth(monthId, false);
    if (!visibleOnly) return sourceRows;

    const selectedWeekdays = new Set(getSelectedLotteryWeekdays());
    return sourceRows.filter((row) => {
        const dateValue = normalizeCourtDateValue(row.date);
        return dateValue ? selectedWeekdays.has(lotteryWeekdayIndex(dateValue)) : true;
    });
}

function getActiveLotteryMonthId() {
    if (activeLotteryTab === 'next') return getMonthData(1).id;
    if (activeLotteryTab === 'selected') return lotterySelectedMonthId;
    return getMonthData(0).id;
}

function updateLotteryMonthLabels() {
    const current = getMonthData(0);
    const next = getMonthData(1);
    const selected = getCourtMonthDataById(lotterySelectedMonthId);

    const labelCur = document.getElementById('label-lottery-current-month');
    const labelNext = document.getElementById('label-lottery-next-month');
    const labelSelected = document.getElementById('label-lottery-selected-month');
    if (labelCur) labelCur.innerText = current.label;
    if (labelNext) labelNext.innerText = next.label;
    if (labelSelected) labelSelected.innerText = selected.id;
}

function updateLotteryEditButton() {
    const editBtn = document.getElementById('lottery-edit-btn');
    if (!editBtn) return;
    const isEditing = lotteryEditState.active && lotteryEditState.monthId === getActiveLotteryMonthId();
    editBtn.innerHTML = isEditing
        ? '<i class="fas fa-times"></i> 取消編輯'
        : '<i class="fas fa-edit"></i> 編輯投籤';
}

function refreshLotteryTableByMonth(monthId) {
    const currentMonthId = getMonthData(0).id;
    const nextMonthId = getMonthData(1).id;
    if (monthId === currentMonthId) renderLotteryTable(currentMonthId, 'lottery-display-current');
    if (monthId === nextMonthId) renderLotteryTable(nextMonthId, 'lottery-display-next');
    if (monthId === lotterySelectedMonthId) renderLotteryTable(lotterySelectedMonthId, 'lottery-display-selected');
}

function renderLotterySlotDisplay(slotData) {
    const slot = normalizeLotterySlot(slotData || {});
    const activeCourts = LOTTERY_COURTS.filter((court) => slot[court] > 0);
    if (activeCourts.length === 0) return '<td class="court-empty">-</td>';
    const lines = activeCourts.map((court) => `
        <div class="lottery-slot-line">
            <span>${court.replace('Court ', '場 ')}</span>
            <strong>${slot[court]}</strong>
        </div>
    `).join('');
    return `<td><div class="lottery-slot-display">${lines}</div></td>`;
}

function renderLotterySlotEditor(slotData, rowDate, slotKey) {
    const slot = normalizeLotterySlot(slotData || {});
    const rows = LOTTERY_COURTS.map((court) => `
        <div class="lottery-edit-row">
            <label>${court.replace('Court ', '場 ')}</label>
            <select onchange="updateLotteryCell('${rowDate}', '${slotKey}', '${court}', this.value)">
                ${[0, 1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${slot[court] === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
        </div>
    `).join('');
    return `<td class="court-edit-cell"><div class="lottery-edit-grid">${rows}</div></td>`;
}

function renderLotteryTable(monthId, containerId) {
    const isEditing = lotteryEditState.active && lotteryEditState.monthId === monthId;
    const tableData = getLotteryDraftRows(monthId, true);
    const monthData = getCourtMonthDataById(monthId);
    let html = '';

    if (isEditing) {
        html += `
            <div class="court-controls">
                <button class="court-btn" onclick="saveLotteryBids()">儲存投籤</button>
                <button class="court-btn" onclick="toggleLotteryEditMode(false)">取消編輯</button>
            </div>
        `;
    }

    html += `
        <div class="court-dashboard-container" data-lottery-month="${monthId}">
            <div class="court-export-title">投籤紀錄 ${monthData.id}</div>
            <table class="court-table lottery-table">
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>18:00 - 20:00</th>
                        <th>20:00 - 22:00</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (tableData.length === 0) {
        html += '<tr><td colspan="3" style="color:#999; padding: 20px;">目前沒有投籤資料。</td></tr>';
    } else {
        tableData.forEach((row) => {
            html += `<tr><td><strong>${row.date} (${row.weekday})</strong></td>`;
            html += isEditing ? renderLotterySlotEditor(row.slot1, row.date, 'slot1') : renderLotterySlotDisplay(row.slot1);
            html += isEditing ? renderLotterySlotEditor(row.slot2, row.date, 'slot2') : renderLotterySlotDisplay(row.slot2);
            html += '</tr>';
        });
    }

    html += '</tbody></table></div>';
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = html;
}

async function fetchAndDisplayLotteryBids(monthId, elementId) {
    try {
        const response = await fetch(`/api/lottery_bids/${monthId}`);
        const data = await response.json();
        const rows = Array.isArray(data.content) ? data.content.map(normalizeLotteryRow) : [];
        setLotteryCache(monthId, rows);
        renderLotteryTable(monthId, elementId);
    } catch (error) {
        console.error(`Failed to load lottery bids for ${monthId}`, error);
        const container = document.getElementById(elementId);
        if (container) container.innerHTML = '<p style="color:red; text-align:center;">投籤資料載入失敗。</p>';
    }
}

async function loadLotteryMonthHistory() {
    const container = document.getElementById('lottery-display-saved');
    if (!container) return;
    try {
        const response = await fetch('/api/lottery_bids_summary');
        const data = await response.json();
        const months = Array.isArray(data.months) ? data.months : [];
        const isCaptain = localStorage.getItem('vbt_role') === 'captain';
        if (months.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; margin:0; padding:20px;">目前還沒有已儲存的投籤紀錄。</p>';
            return;
        }
        container.innerHTML = `
            <div class="court-dashboard-container">
                <table class="court-table probability-table">
                    <thead>
                        <tr>
                            <th>已儲存月份</th>
                            ${isCaptain ? '<th>刪除場地</th>' : ''}
                            <th>總投籤數</th>
                            ${isCaptain ? '<th>刪除投籤</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${months.map((item) => `
                            <tr>
                                <td><strong class="${item.has_court_data ? '' : 'missing-data-text'}">${escapeHtml(item.month_id)}</strong></td>
                                ${isCaptain ? `<td>${item.has_court_data ? `<button type="button" class="court-btn" style="padding:6px 14px; font-size:0.8rem;" onclick="deleteCourtOnlyMonth('${item.month_id}')">刪除場地</button>` : '<span class="missing-data-text">缺少資料</span>'}</td>` : ''}
                                <td><span class="${item.has_bid_data ? '' : 'missing-data-text'}">${item.has_bid_data ? item.total_bids : '缺少資料'}</span></td>
                                ${isCaptain ? `<td>${item.has_bid_data ? `<button type="button" class="court-btn" style="padding:6px 14px; font-size:0.8rem;" onclick="deleteBidOnlyMonth('${item.month_id}')">刪除投籤</button>` : '<span class="missing-data-text">缺少資料</span>'}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load lottery month history', error);
    }
}

async function loadLotteryBids() {
    const current = getMonthData(0);
    const next = getMonthData(1);
    updateLotteryMonthLabels();
    await fetchAndDisplayLotteryBids(current.id, 'lottery-display-current');
    await fetchAndDisplayLotteryBids(next.id, 'lottery-display-next');
    await fetchAndDisplayLotteryBids(lotterySelectedMonthId, 'lottery-display-selected');
    await loadLotteryMonthHistory();
    updateLotteryEditButton();
}

function switchLotteryTab(tabType) {
    activeLotteryTab = tabType;
    document.getElementById('lottery-tab-current').classList.toggle('active', tabType === 'current');
    document.getElementById('lottery-tab-next').classList.toggle('active', tabType === 'next');
    document.getElementById('lottery-tab-selected').classList.toggle('active', tabType === 'selected');
    document.getElementById('lottery-tab-saved').classList.toggle('active', tabType === 'saved');
    document.getElementById('lottery-display-current').style.display = tabType === 'current' ? 'block' : 'none';
    document.getElementById('lottery-display-next').style.display = tabType === 'next' ? 'block' : 'none';
    document.getElementById('lottery-display-selected').style.display = tabType === 'selected' ? 'block' : 'none';
    document.getElementById('lottery-display-saved').style.display = tabType === 'saved' ? 'block' : 'none';
    updateLotteryEditButton();
    loadLotteryDashboard();
}

async function loadSelectedLotteryMonth() {
    const picker = document.getElementById('lottery-month-picker');
    lotterySelectedMonthId = picker && picker.value ? picker.value : getMonthData(0).id;
    updateLotteryMonthLabels();
    await fetchAndDisplayLotteryBids(lotterySelectedMonthId, 'lottery-display-selected');
    switchLotteryTab('selected');
}

function toggleLotteryEditMode(forceState) {
    const monthId = getActiveLotteryMonthId();
    const shouldEnable = typeof forceState === 'boolean' ? forceState : !(lotteryEditState.active && lotteryEditState.monthId === monthId);
    if (shouldEnable) {
        lotteryEditState.active = true;
        lotteryEditState.monthId = monthId;
        lotteryEditState.draftRows = cloneLotteryRows(getLotteryRowsForMonth(monthId, false));
    } else {
        lotteryEditState.active = false;
        lotteryEditState.monthId = null;
        lotteryEditState.draftRows = [];
    }
    refreshLotteryTableByMonth(monthId);
    updateLotteryEditButton();
}

function updateLotteryCell(rowDate, slotKey, court, value) {
    if (!lotteryEditState.active) return;
    const normalizedDate = normalizeCourtDateValue(rowDate);
    const row = lotteryEditState.draftRows.find((item) => item.date === normalizedDate);
    if (!row) return;
    row[slotKey] = normalizeLotterySlot(row[slotKey] || {});
    row[slotKey][court] = Math.max(0, Math.min(5, Number.parseInt(value, 10) || 0));
}

async function saveLotteryBids() {
    if (!lotteryEditState.active || !lotteryEditState.monthId) return;
    const monthId = lotteryEditState.monthId;
    const sanitizedRows = lotteryEditState.draftRows.map(normalizeLotteryRow);
    try {
        const response = await fetch('/api/lottery_bids', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month_id: monthId, content: sanitizedRows })
        });
        if (response.ok) {
            setLotteryCache(monthId, sanitizedRows);
            lotteryEditState.active = false;
            lotteryEditState.monthId = null;
            lotteryEditState.draftRows = [];
            refreshLotteryTableByMonth(monthId);
            await loadLotteryMonthHistory();
            await loadLotteryDashboard();
            updateLotteryEditButton();
            alert(`${monthId} 的投籤紀錄已成功儲存。`);
        } else {
            alert('儲存投籤紀錄失敗。');
        }
    } catch (error) {
        console.error('Error saving lottery bids', error);
        alert('儲存投籤紀錄失敗。');
    }
}

function initProbabilityControls() {
    const currentMonthId = getMonthData(0).id;
    const startInput = document.getElementById('probability-start-month');
    const endInput = document.getElementById('probability-end-month');
    const picker = document.getElementById('lottery-month-picker');
    if (startInput) startInput.value = currentMonthId;
    if (endInput) endInput.value = currentMonthId;
    if (picker) picker.value = currentMonthId;
}

function switchProbabilityTab(tabType) {
    activeProbabilityTab = tabType;
    document.getElementById('probability-tab-selected').classList.toggle('active', tabType === 'selected');
    document.getElementById('probability-tab-all').classList.toggle('active', tabType === 'all');
    document.getElementById('probability-selected-panel').style.display = tabType === 'selected' ? 'block' : 'none';
    document.getElementById('probability-all-panel').style.display = tabType === 'all' ? 'block' : 'none';
}

function switchStrategyTab(tabType) {
    activeStrategyTab = tabType;
    document.getElementById('strategy-tab-selected').classList.toggle('active', tabType === 'selected');
    document.getElementById('strategy-tab-all').classList.toggle('active', tabType === 'all');
    document.getElementById('strategy-selected-panel').style.display = tabType === 'selected' ? 'block' : 'none';
    document.getElementById('strategy-all-panel').style.display = tabType === 'all' ? 'block' : 'none';
}

function getProbabilityCellTone(winRate, attempts) {
    if (!attempts) return '#f8fafc';
    if (attempts < 2) return '#f2f6f9';

    const blueScale = [
        '#f3f6f9',
        '#edf3f8',
        '#e6eef5',
        '#dde8f2',
        '#d3e2ee',
        '#c5d9e8',
        '#b5cde0',
        '#9dbbd3',
        '#7ea4c1',
        '#5f86a7',
    ];
    const normalized = Math.max(0, Math.min(100, Number(winRate) || 0));
    const index = Math.min(blueScale.length - 1, Math.floor(normalized / 10));
    return blueScale[index];
}


function getProbabilityCellPalette(winRate, attempts) {
    const background = getProbabilityCellTone(winRate, attempts);
    if (!attempts) {
        return { background, text: '#5d7082', subtext: '#708394', border: 'rgba(77, 102, 124, 0.08)' };
    }
    if (attempts < 2) {
        return { background, text: '#4f6477', subtext: '#6d8090', border: 'rgba(77, 102, 124, 0.10)' };
    }

    const normalized = Math.max(0, Math.min(100, Number(winRate) || 0));
    if (normalized >= 80) {
        return { background, text: '#ffffff', subtext: 'rgba(255, 255, 255, 0.92)', border: 'rgba(53, 82, 105, 0.18)' };
    }
    if (normalized >= 60) {
        return { background, text: '#203444', subtext: '#f4f8fb', border: 'rgba(53, 82, 105, 0.16)' };
    }
    if (normalized >= 30) {
        return { background, text: '#324a5e', subtext: '#4c6478', border: 'rgba(77, 102, 124, 0.14)' };
    }
    return { background, text: '#4f6477', subtext: '#6b7f90', border: 'rgba(77, 102, 124, 0.12)' };
}

function renderProbabilityMatrix(stats, emptyMessage, selectedWeekdays, selectedCourts) {
    const weekdayNames = selectedWeekdays.map((index) => LOTTERY_WEEKDAY_NAMES[index]);
    const filteredStats = (Array.isArray(stats) ? stats : []).filter((item) => weekdayNames.includes(item.weekday) && selectedCourts.includes(item.court));
    if (filteredStats.length === 0) return `<p style="text-align:center; color:#999; padding: 20px;">${emptyMessage}</p>`;

    const times = ['18:00-20:00', '20:00-22:00'];
    const statMap = new Map(filteredStats.map((item) => [`${item.weekday}|${item.time}|${item.court}`, item]));
    let html = '<div class="court-dashboard-container"><div class="probability-matrix"><table class="court-table probability-table"><thead><tr><th>星期 / 時段</th>';
    selectedCourts.forEach((court) => { html += `<th>${court.replace('Court ', '場 ')}</th>`; });
    html += '</tr></thead><tbody>';

    weekdayNames.forEach((weekday) => {
        times.forEach((time) => {
            html += `<tr><td><strong>${weekday}</strong><br>${time}</td>`;
            selectedCourts.forEach((court) => {
                const item = statMap.get(`${weekday}|${time}|${court}`);
                const winRate = item ? item.win_rate : 0;
                const attempts = item ? item.attempts : 0;
                const totalWins = item ? item.total_wins : 0;
                const ticketProbability = item ? item.ticket_probability : 0;
                const palette = getProbabilityCellPalette(winRate, attempts);
                html += `
                    <td>
                        <div class="probability-cell" style="background:${palette.background}; color:${palette.text}; border-color:${palette.border};">
                            <strong style="color:${palette.text};">${winRate}%</strong>
                            <small style="color:${palette.subtext};">中籤 ${totalWins} / 嘗試 ${attempts} ・ 單籤機率 ${ticketProbability}%</small>
                        </div>
                    </td>
                `;
            });
            html += '</tr>';
        });
    });

    html += '</tbody></table></div></div>';
    return html;
}

function groupStrategyRows(rows) {
    const grouped = new Map();
    (rows || []).forEach((row) => {
        if (!grouped.has(row.date)) {
            grouped.set(row.date, { date: row.date, weekday: row.weekday, dateSuccessRate: 0, slot1: null, slot2: null });
        }
        const target = grouped.get(row.date);
        if (row.time === '18:00-20:00') target.slot1 = row;
        else target.slot2 = row;
    });
    return Array.from(grouped.values())
        .map((dayRow) => {
            const slot1Rate = dayRow.slot1 ? ((dayRow.slot1.success_rate || 0) / 100) : 0;
            const slot2Rate = dayRow.slot2 ? ((dayRow.slot2.success_rate || 0) / 100) : 0;
            dayRow.dateSuccessRate = Math.round((1 - ((1 - slot1Rate) * (1 - slot2Rate))) * 1000) / 10;
            return dayRow;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
}

function renderStrategyCell(dayRow, court) {
    const slot1Bid = dayRow.slot1 ? (dayRow.slot1.allocations[court] || 0) : 0;
    const slot2Bid = dayRow.slot2 ? (dayRow.slot2.allocations[court] || 0) : 0;
    const slot1Class = slot1Bid > 0 ? ` strategy-bid--level-${Math.min(slot1Bid, 5)}` : '';
    const slot2Class = slot2Bid > 0 ? ` strategy-bid--level-${Math.min(slot2Bid, 5)}` : '';
    return `
        <td class="strategy-split-cell">
            <div class="strategy-split-stack">
                <div class="strategy-split-half">
                    <span class="strategy-bid${slot1Class}">${slot1Bid}</span>
                </div>
                <div class="strategy-split-half">
                    <span class="strategy-bid${slot2Class}">${slot2Bid}</span>
                </div>
            </div>
        </td>
    `;
}

function renderStrategySuccessCell(dayRow) {
    const slot1Rate = dayRow.slot1 ? (dayRow.slot1.success_rate || 0) : 0;
    const slot2Rate = dayRow.slot2 ? (dayRow.slot2.success_rate || 0) : 0;
    return `
        <td class="strategy-split-cell">
            <div class="strategy-split-stack">
                <div class="strategy-split-half">
                    <span class="strategy-split-rate">${slot1Rate}%</span>
                </div>
                <div class="strategy-split-half">
                    <span class="strategy-split-rate">${slot2Rate}%</span>
                </div>
            </div>
        </td>
    `;
}

function renderStrategyTable(rows, summaryLabel, selectedCourts) {
    if (!Array.isArray(rows) || rows.length === 0) return '<p style="text-align:center; color:#999; padding: 20px;">資料不足，無法產生策略建議。</p>';
    const days = groupStrategyRows(rows);
    let html = `<div class="strategy-note">${escapeHtml(summaryLabel)}</div>`;
    html += '<div class="court-dashboard-container"><div class="probability-matrix"><table class="court-table probability-table"><thead><tr><th>日期</th>';
    selectedCourts.forEach((court) => { html += `<th>${court.replace('Court ', '場 ')}<br><small>18-20 / 20-22</small></th>`; });
    html += '<th>時段成功率<br><small>18-20 / 20-22</small></th><th>單日成功率</th></tr></thead><tbody>';

    days.forEach((dayRow) => {
        html += `<tr><td><strong>${dayRow.date} (${dayRow.weekday})</strong></td>`;
        selectedCourts.forEach((court) => { html += renderStrategyCell(dayRow, court); });
        html += renderStrategySuccessCell(dayRow);
        html += `<td><strong>${dayRow.dateSuccessRate}%</strong></td></tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
}

function refreshLotteryDashboard() {
    loadLotteryDashboard();
}

function refreshStrategyPanel() {
    loadLotteryDashboard();
}

function getStrategyWeights() {
    const ratioInput = document.getElementById('strategy-weight-ratio');
    const ratio = Number.parseFloat(ratioInput ? ratioInput.value : '1.3');
    const late = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.3;
    return {
        early: 1,
        late,
    };
}

async function loadLotteryDashboard() {
    const startInput = document.getElementById('probability-start-month');
    const endInput = document.getElementById('probability-end-month');
    if (!startInput || !endInput) return;

    let startMonth = startInput.value || getMonthData(0).id;
    let endMonth = endInput.value || startMonth;
    if (startMonth > endMonth) {
        [startMonth, endMonth] = [endMonth, startMonth];
        startInput.value = startMonth;
        endInput.value = endMonth;
    }

    const targetMonth = getMonthData(1).id;
    const probabilityWeekdays = getSelectedProbabilityWeekdays();
    const strategyWeekdays = getSelectedStrategyWeekdays();
    const probabilityCourts = getSelectedProbabilityCourts();
    const strategyCourts = getSelectedStrategyCourts();
    const strategyWeights = getStrategyWeights();

    const params = new URLSearchParams({
        start_month: startMonth,
        end_month: endMonth,
        target_month: targetMonth,
        strategy_weight_ratio: String(strategyWeights.late),
    });
    strategyWeekdays.forEach((weekday) => params.append('strategy_weekday', String(weekday)));

    try {
        const response = await fetch(`/api/lottery_dashboard?${params.toString()}`);
        const data = await response.json();

        const selectedPanel = document.getElementById('probability-selected-panel');
        const allPanel = document.getElementById('probability-all-panel');
        const summary = document.getElementById('probability-summary');
        const strategySelectedPanel = document.getElementById('strategy-selected-panel');
        const strategyAllPanel = document.getElementById('strategy-all-panel');

        if (selectedPanel) selectedPanel.innerHTML = renderProbabilityMatrix(data.selected.stats, '所選月份區間內沒有可用的對應資料。', probabilityWeekdays, probabilityCourts);
        if (allPanel) allPanel.innerHTML = renderProbabilityMatrix(data.all_time.stats, '目前還沒有足夠的歷史資料。', probabilityWeekdays, probabilityCourts);
        if (summary) {
            const usedRange = (data.selected.months_used || []).join(', ') || '無';
            const usedHistory = (data.all_time.months_used || []).join(', ') || '無';
            summary.innerHTML = `所選區間：<strong>${escapeHtml(usedRange)}</strong><br>全部歷史：<strong>${escapeHtml(usedHistory)}</strong>`;
        }
        const selectedStrategySummary = `所選區間：${(data.selected.months_used || []).join(', ') || '無'}`;
        const allHistoryStrategySummary = `全部歷史：${(data.all_time.months_used || []).join(', ') || '無'}`;
        if (strategySelectedPanel) strategySelectedPanel.innerHTML = renderStrategyTable(data.strategy.selected.rows, selectedStrategySummary, strategyCourts);
        if (strategyAllPanel) strategyAllPanel.innerHTML = renderStrategyTable(data.strategy.all_time.rows, allHistoryStrategySummary, strategyCourts);

        switchProbabilityTab(activeProbabilityTab);
        switchStrategyTab(activeStrategyTab);
    } catch (error) {
        console.error('載入投籤儀表板失敗', error);
    }
}

async function downloadStrategyTableAsPng() {
    const panelId = activeStrategyTab === 'all' ? 'strategy-all-panel' : 'strategy-selected-panel';
    const target = document.getElementById(panelId);
    if (!target) return;

    const captureNode = target.querySelector('.court-dashboard-container') || target;
    if (typeof html2canvas !== 'function') {
        alert('截圖功能尚未載入完成。');
        return;
    }

    const canvas = await html2canvas(captureNode, {
        backgroundColor: '#ffffff',
        scale: Math.max(window.devicePixelRatio || 1, 2),
        useCORS: true,
    });

    const link = document.createElement('a');
    link.download = `strategy-${activeStrategyTab === 'all' ? 'all-history' : 'selected-range'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

window.addEventListener('load', initLotteryWeekdayFilters);
window.addEventListener('load', initProbabilityControls);
window.addEventListener('load', loadLotteryBids);
window.addEventListener('load', loadLotteryDashboard);
window.addEventListener('load', () => {
    ['strategy-weight-ratio'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('change', loadLotteryDashboard);
    });
});

// ==========================================
// 7. Change Password Feature
// ==========================================
function openChangePassword() {
    document.getElementById('change-password-overlay').style.setProperty('display', 'flex', 'important');
    document.getElementById('cp-message').innerText = '';
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
    
    // 自動關閉頭像下拉選單
    const menu = document.getElementById('avatarMenu');
    if(menu) menu.classList.remove('active');
}

function closeChangePassword() {
    document.getElementById('change-password-overlay').style.setProperty('display', 'none', 'important');
}

async function submitChangePassword() {
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const messageEl = document.getElementById('cp-message');
    
    // 從 LocalStorage 抓取當前登入的帳號
    const username = localStorage.getItem('vbt_username');

    if (!oldPassword || !newPassword) {
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '請填寫所有欄位。';
        return;
    }

    // 按鈕顯示讀取中
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '更新中...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/change_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, old_password: oldPassword, new_password: newPassword })
        });
        
        const data = await response.json();

        if (response.ok) {
            messageEl.style.color = '#2ecc71';
            messageEl.innerText = '密碼更新成功！';
            setTimeout(() => {
                closeChangePassword();
            }, 1500);
        } else {
            messageEl.style.color = '#ff4757';
            messageEl.innerText = data.error || '密碼更新失敗。';
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '伺服器連線失敗。';
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}
// ==========================================
// 8. Keyboard Shortcuts (Enter to Submit)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 建立一個共用的小工具：綁定 Enter 鍵到指定的按鈕功能上
    const attachEnter = (inputId, submitFunction) => {
        const inputElement = document.getElementById(inputId);
        if (inputElement) {
            inputElement.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    submitFunction();
                }
            });
        }
    };

    // 幫登入欄位加上 Enter 快捷鍵
    attachEnter('username', handleLogin);
    attachEnter('login-password', handleLogin);

    // 幫註冊欄位加上 Enter 快捷鍵
    attachEnter('reg-username', handleRegister);
    attachEnter('reg-password', handleRegister);

    // 幫修改密碼欄位加上 Enter 快捷鍵
    attachEnter('old-password', submitChangePassword);
    attachEnter('new-password', submitChangePassword);
});
// ==========================================
// 9. Dynamic Announcements Feature
// ==========================================
window.addEventListener('load', loadAnnouncements);

async function loadAnnouncements() {
    try {
        const response = await fetch('/api/announcements');
        if (response.ok) {
            const data = await response.json();
            window.currentAnnouncementsRaw = data.content; // 記住純文字，編輯時要用
            renderAnnouncements(data.content);
        }
    } catch (error) {
        console.error('Error loading announcements:', error);
    }
}

function renderAnnouncements(rawText) {
    const container = document.getElementById('announcement-content');
    if (!rawText || !rawText.trim()) {
        container.innerHTML = '<p style="color:#999; margin: 0;">目前沒有新公告。</p>';
        return;
    }
    
    // 把文字依照換行符號切開
    const lines = rawText.split('\n').filter(line => line.trim() !== '');
    
    let html = '<ul class="announcement-list">';
    lines.forEach(line => { 
        let formattedLine = line;
        // 如果有冒號，就把冒號前面的字加粗
        if (line.includes(':')) {
            const parts = line.split(/:(.*)/s); 
            formattedLine = `<strong>${parts[0]}</strong>:${parts[1]}`;
        } else if (line.includes('：')) {
            const parts = line.split(/：(.*)/s);
            formattedLine = `<strong>${parts[0]}</strong>：${parts[1]}`;
        }
        html += `<li class="announcement-item">${formattedLine}</li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
}

function openEditAnnouncement() {
    document.getElementById('edit-announcement-overlay').style.setProperty('display', 'flex', 'important');
    document.getElementById('announcement-textarea').value = window.currentAnnouncementsRaw || '';
}

function closeEditAnnouncement() {
    document.getElementById('edit-announcement-overlay').style.setProperty('display', 'none', 'important');
}

async function submitAnnouncements() {
    const newContent = document.getElementById('announcement-textarea').value;
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '儲存中...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent })
        });

        if (response.ok) {
            closeEditAnnouncement();
            loadAnnouncements(); // 儲存成功後，重新讀取並刷新畫面
        } else {
            alert('公告儲存失敗。');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('伺服器連線失敗。');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}
// ==========================================
// 10. Showcase Slider Feature (首頁合照輪播)
// ==========================================
window.addEventListener('load', loadShowcaseSlider);

let sliderInterval; // 宣告計時器

async function loadShowcaseSlider() {
    const container = document.getElementById('showcase-slider-container');
    if (!container) return;

    try {
        const response = await fetch('/api/showcase_photo_assets');
        const photos = await response.json();

        if (!photos || photos.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = ''; 

        let slidesHtml = '';
        let dotsHtml = '<div class="slider-dots">';

        photos.forEach((photo, index) => {
            const imgPath = photo.src;
            const activeClass = index === 0 ? 'active' : '';
            slidesHtml += `<img src="${imgPath}" class="showcase-slide ${activeClass}" onclick="openLightbox('${imgPath}')">`;
            dotsHtml += `<div class="dot ${activeClass}" onclick="goToSlide(${index})"></div>`;
        });

        dotsHtml += '</div>';
        container.innerHTML = slidesHtml + dotsHtml;

        startSliderTimer();

    } catch (error) {
        console.error('Error loading showcase slider:', error);
    }
}

function startSliderTimer() {
    clearInterval(sliderInterval);
    sliderInterval = setInterval(() => {
        nextSlide();
    }, 4500); // 4500 毫秒 = 4.5 秒換一張
}

function nextSlide() {
    const slides = document.querySelectorAll('.showcase-slide');
    if (slides.length <= 1) return;

    let currentIndex = Array.from(slides).findIndex(slide => slide.classList.contains('active'));
    let nextIndex = (currentIndex + 1) % slides.length;

    goToSlide(nextIndex);
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.showcase-slide');
    const dots = document.querySelectorAll('.dot');
    
    // 移除舊的 active
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));

    // 加上新的 active
    slides[index].classList.add('active');
    dots[index].classList.add('active');

    // 重新計時 (避免使用者手動點擊後，馬上又跳下一張)
    startSliderTimer();
}
