    let uploadedFilename = '';
    let boqData = [];
    let measurementData = [];
    let selectedItem = null;
    // NEW
    let selectedItems = [];
    let selectedSubItems = [];
    let measurementQueue = [];
    let currentQueueIndex = 0;
    let redraw = null;
    let originalStep2HTML = '';

    let rotationAngle = 0;
    let rotatedPhotoCanvas = null;
    let multiLengths = [];
    let multiBreadths = [];
    let phase = 'ruler';
    let rulerPoints = [];
    let measurements = {}; // measurements[subCatIdx][imageIdx] = {lengthFt, breadthFt, ...}
    let imageIndex = 0;
    let rulerSetForCurrentImage = false;
    let activeSubCatTab = 0;
    let isSelectingSubItems = false;

    // ─── SESSION RESTORE ─────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', () => {
        originalStep2HTML = document.getElementById('step2-content').innerHTML;
        if (sessionStorage.getItem('uploadedFilename')) {
            uploadedFilename = sessionStorage.getItem('uploadedFilename');
            document.getElementById('file-title').textContent = uploadedFilename;
            showSheetPage();
            loadBOQ();
        }
    });

    // ─── UPLOAD PAGE LOGIC ───────────────────────────────────────────
    const fileInput = document.getElementById('file-input');
    const uploadBox = document.getElementById('upload-box');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInfo = document.getElementById('file-info');
    const fileNameDisplay = document.getElementById('file-name-display');
    const removeFile = document.getElementById('remove-file');
    const uploadError = document.getElementById('upload-error');
    const loading = document.getElementById('loading');

    uploadBox.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    if (e.target.tagName === 'LABEL') return;
    fileInput.click();
});

    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('drag-over');
    });

    uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('drag-over'));

    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
    });

    function handleFileSelect(file) {
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            showError('Please select an Excel file (.xlsx or .xls)');
            return;
        }
        fileNameDisplay.textContent = '📄 ' + file.name;
        fileInfo.classList.remove('hidden');
        uploadBtn.disabled = false;
        uploadError.classList.add('hidden');
    }

    removeFile.addEventListener('click', () => {
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        uploadBtn.disabled = true;
    });

    uploadBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        loading.classList.remove('hidden');
        uploadBtn.disabled = true;
        uploadError.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/upload', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                uploadedFilename = data.filename;
                sessionStorage.setItem('uploadedFilename', data.filename);
                document.getElementById('file-title').textContent = data.filename;
                showSheetPage();
                loadBOQ();
            } else {
                showError(data.error);
                uploadBtn.disabled = false;
            }
        } catch (e) {
            showError('Upload failed. Make sure Flask is running.');
            uploadBtn.disabled = false;
        } finally {
            loading.classList.add('hidden');
        }
    });

    function showError(msg) {
        uploadError.textContent = msg;
        uploadError.classList.remove('hidden');
    }

    // ─── PAGE SWITCH ─────────────────────────────────────────────────
    function showSheetPage() {
        document.getElementById('upload-page').classList.add('hidden');
        document.getElementById('sheet-page').classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-boq').classList.add('active');
        document.getElementById('boq-tab').classList.add('active');
    }

    document.getElementById('back-btn').addEventListener('click', () => {
        sessionStorage.removeItem('uploadedFilename');
        boqData = [];
        measurementData = [];
        document.getElementById('boq-tbody').innerHTML = '';
        document.getElementById('measurement-tbody').innerHTML = '';
        document.getElementById('sheet-page').classList.add('hidden');
        document.getElementById('upload-page').classList.remove('hidden');
        uploadBtn.disabled = true;
        fileInfo.classList.add('hidden');
        fileInput.value = '';
    });

    document.getElementById('back-to-measurement-btn').addEventListener('click', () => {
        document.getElementById('upload-image-page').classList.add('hidden');
        document.getElementById('sheet-page').classList.remove('hidden');
        document.getElementById('step2-content').innerHTML = originalStep2HTML;
        const multiBar = document.getElementById('multi-line-done-bar');
        if (multiBar) multiBar.remove();
        const subBar = document.getElementById('subitem-floating-bar');
        if (subBar) subBar.style.display = 'none';
        const boqBar = document.getElementById('boq-floating-bar');
        if (boqBar) boqBar.style.display = 'none';
        selectedSubItems = [];
        selectedItems = [];
        switchTab('measurement');
    });

    // ─── TAB SWITCH ──────────────────────────────────────────────────
    function switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-' + tab).classList.add('active');
        document.getElementById(tab + '-tab').classList.add('active');
        if (tab === 'measurement') {
            if (measurementData.length === 0) {
                loadMeasurement();
            } else if (document.getElementById('measurement-tbody').innerHTML === '') {
                renderAllMatchedSections();
            }
        }
        const boqBar = document.getElementById('boq-floating-bar');
        const subBar = document.getElementById('subitem-floating-bar');
        if (boqBar) boqBar.style.display = tab === 'boq' && selectedItems.length > 0 ? 'flex' : 'none';
        if (subBar) subBar.style.display = tab === 'measurement' && selectedSubItems.length > 0 ? 'flex' : 'none';
    }

    // ─── LOAD BOQ ────────────────────────────────────────────────────
    async function loadBOQ() {
        try {
            const res = await fetch('/get-boq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: uploadedFilename })
            });
            const data = await res.json();
            if (data.success) {
                boqData = data.data;
                renderBOQTable(boqData);
            }
        } catch (e) {
            console.error('Failed to load BOQ', e);
        }
    }

    // ─── LOAD MEASUREMENT ────────────────────────────────────────────
    async function loadMeasurement() {
        try {
            const res = await fetch('/get-measurement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: uploadedFilename })
            });
            const data = await res.json();
            if (data.success) {
                measurementData = data.data;
                renderAllMatchedSections();
            }
        } catch (e) {
            console.error('Failed to load Measurement', e);
        }
    }

    // ─── RENDER BOQ TABLE WITH CHECKBOXES ────────────────────────────
    function renderBOQTable(rows) {
        const tbody = document.getElementById('boq-tbody');
        tbody.innerHTML = '';
        selectedItems = [];
        updateBOQFloatingBar();

        rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-row', rowIndex);

            const checkTd = document.createElement('td');
            checkTd.className = 'row-checkbox-cell';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    tr.classList.add('highlighted-row');
                    selectedItems.push({ row, rowIndex });
                } else {
                    tr.classList.remove('highlighted-row');
                    selectedItems = selectedItems.filter(i => i.rowIndex !== rowIndex);
                }
                updateBOQFloatingBar();
            });
            checkTd.appendChild(cb);
            tr.appendChild(checkTd);

            row.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell === 'nan' ? '' : cell;
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    }

    function updateBOQFloatingBar() {
        let bar = document.getElementById('boq-floating-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'boq-floating-bar';
            bar.style.cssText = `
                position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
                background: #e63900; color: white; padding: 14px 32px;
                border-radius: 32px; font-size: 1rem; font-weight: 600;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 9999;
                cursor: pointer; display: none; align-items: center; gap: 12px;
            `;
            bar.addEventListener('click', () => {
                if (selectedItems.length === 0) return;
                showMultiConfirmModal();
            });
            document.body.appendChild(bar);
        }
        if (selectedItems.length > 0) {
            bar.style.display = 'flex';
            bar.textContent = `✅ ${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''} selected — Proceed to Measurement →`;
        } else {
            bar.style.display = 'none';
        }
    }

    // ─── RENDER NORMAL TABLE ─────────────────────────────────────────
    function renderTable(tbodyId, rows, highlightRowIndex = -1, subRowStart = -1, subRowEnd = -1) {
        const tbody = document.getElementById(tbodyId);
        tbody.innerHTML = '';
        rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-row', rowIndex);

            if (tbodyId === 'measurement-tbody') {
                const checkTd = document.createElement('td');
                checkTd.className = 'row-checkbox-cell';

                if (rowIndex === highlightRowIndex) {
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = true;
                    cb.style.accentColor = '#e63900';
                    checkTd.appendChild(cb);
                    tr.classList.add('highlighted-row');

                } else if (rowIndex > highlightRowIndex && rowIndex >= subRowStart && rowIndex <= subRowEnd) {
                    const particularsCell = (row[2] || '').toString().replace(/nan/gi, '').trim();
                    const isTotalQty = particularsCell.toLowerCase().includes('total qty');
                    const isBlank = particularsCell === '';

                    if (!isBlank && !isTotalQty) {
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.style.accentColor = '#e63900';
                        cb.addEventListener('change', () => {
                            if (cb.checked) {
                                tbody.querySelectorAll('input[type="checkbox"]').forEach(other => {
                                    if (other !== cb) other.checked = false;
                                });
                                tbody.querySelectorAll('tr').forEach(r => {
                                    const rowIdx = parseInt(r.getAttribute('data-row'));
                                    if (rowIdx !== highlightRowIndex) r.classList.remove('highlighted-row');
                                });
                                const cellText = row.filter(c => c && c !== 'nan' && c.trim() !== '').join(' › ');
                                tr.classList.add('highlighted-row');
                                showSubItemConfirm(cellText, row);
                            } else {
                                tr.classList.remove('highlighted-row');
                            }
                        });
                        checkTd.appendChild(cb);
                    }
                }

                tr.appendChild(checkTd);
            }

            row.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell === 'nan' ? '' : cell;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }
    function renderAllMatchedSections() {
        if (isSelectingSubItems) return;
        const tbody = document.getElementById('measurement-tbody');
        tbody.innerHTML = '';
        selectedSubItems = [];
        updateSubItemFloatingBar();

        const ranges = selectedItems.map(selItem => {
            const matchRowIndex = selItem.matchRowIndex;
            if (matchRowIndex === undefined || matchRowIndex === -1) return null;
            let subRowEnd = measurementData.length - 1;
            for (let i = matchRowIndex + 1; i < measurementData.length; i++) {
                if (measurementData[i].join(' ').toLowerCase().includes('total qty')) {
                    subRowEnd = i;
                    break;
                }
            }
            return { matchRowIndex, subRowEnd, keyword: selItem.primaryKeyword };
        }).filter(Boolean);

        const noMatches = ranges.length === 0;

        measurementData.forEach((row, rowIndex) => {
            const matchedSection = ranges.find(r => rowIndex === r.matchRowIndex);
            const inSubRange = ranges.find(r => rowIndex > r.matchRowIndex && rowIndex <= r.subRowEnd);

            // ── FILTER: only show matched sections + their sub-rows ──
            if (!noMatches && !matchedSection && !inSubRange) return;

            const tr = document.createElement('tr');
            tr.setAttribute('data-row', rowIndex);

            const checkTd = document.createElement('td');
            checkTd.className = 'row-checkbox-cell';

            const particularsCell = (row[2] || '').toString().replace(/nan/gi, '').trim();
            const isTotalQty = particularsCell.toLowerCase().includes('total qty');
            const isBlank = particularsCell === '';

            if (matchedSection) {
                tr.classList.add('highlighted-row');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.disabled = true;
                cb.style.accentColor = '#e63900';
                checkTd.appendChild(cb);
            } else if (inSubRange || noMatches) {
                if (!isBlank && !isTotalQty) {
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.style.accentColor = '#e63900';
                    cb.onclick = () => {
                        isSelectingSubItems = true;
                        const cellText = row.filter(c => c && c !== 'nan' && c.trim() !== '').join(' › ');
                        let parentName = '';
                        if (!noMatches) {
                            const parentRange = ranges.find(r => rowIndex > r.matchRowIndex && rowIndex <= r.subRowEnd);
                            const parentRow = parentRange ? measurementData[parentRange.matchRowIndex] : null;
                            parentName = parentRow ? parentRow.filter(c => c && c !== 'nan' && c.trim() !== '').slice(0, 3).join(' › ') : '';
                        }
                        const fullLabel = parentName ? `${parentName}  ›  ${cellText}` : cellText;
                        if (cb.checked) {
                            tr.classList.add('highlighted-row');
                            selectedSubItems.push({ cellText: fullLabel, row, rowIndex });
                        } else {
                            tr.classList.remove('highlighted-row');
                            selectedSubItems = selectedSubItems.filter(i => i.rowIndex !== rowIndex);
                        }
                        updateSubItemFloatingBar();
                        setTimeout(() => { isSelectingSubItems = false; }, 300);
                    };
                    checkTd.appendChild(cb);
                }
            }

            tr.appendChild(checkTd);
            row.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell === 'nan' ? '' : cell;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        if (ranges.length > 0) {
            scrollToRow('measurement-tbody', ranges[0].matchRowIndex);
            showMatchNotification(ranges[0].keyword || '');
        } else {
            showNoMatchNotification();
        }
    }

    function updateSubItemFloatingBar() {
        let bar = document.getElementById('subitem-floating-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'subitem-floating-bar';
            bar.style.cssText = `
                position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
                background: #2e7d32; color: white; padding: 14px 32px;
                border-radius: 32px; font-size: 1rem; font-weight: 600;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 9999;
                cursor: pointer; display: none; align-items: center; gap: 12px;
            `;
            document.body.appendChild(bar);
        }
        bar.onclick = () => {
            if (selectedSubItems.length === 0) return;
            isSelectingSubItems = false;
            measurementQueue = [...selectedSubItems];
            currentQueueIndex = 0;
            openUploadImagePage(measurementQueue[0].cellText);
        };
        if (selectedSubItems.length > 0) {
            bar.style.display = 'flex';
            bar.textContent = `📷 ${selectedSubItems.length} sub-item${selectedSubItems.length > 1 ? 's' : ''} selected — Start Measuring →`;
        } else {
            bar.style.display = 'none';
        }
    }

    // ─── SEARCH IN BOQ ───────────────────────────────────────────────
    const boqSearch = document.getElementById('boq-search');
    const searchResults = document.getElementById('search-results');

    boqSearch.addEventListener('input', () => {
        const query = boqSearch.value.trim().toLowerCase();
        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }

        const matches = [];
        boqData.forEach((row, rowIndex) => {
            const rowText = row.join(' ').toLowerCase();
            if (rowText.includes(query)) {
                matches.push({ row, rowIndex });
            }
        });

        if (matches.length === 0) {
            searchResults.innerHTML = '<div style="padding:12px;color:#999">No results found</div>';
            searchResults.classList.remove('hidden');
            return;
        }

        searchResults.innerHTML = '';
        matches.slice(0, 20).forEach(({ row, rowIndex }) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';

            // Sync checkbox state with selectedItems
            checkbox.checked = selectedItems.some(i => i.rowIndex === rowIndex);

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    if (!selectedItems.some(i => i.rowIndex === rowIndex)) {
                        selectedItems.push({ row, rowIndex });
                    }
                    // Also highlight the row in BOQ table
                    const boqRow = document.querySelector(`#boq-tbody tr[data-row="${rowIndex}"]`);
                    if (boqRow) {
                        boqRow.classList.add('highlighted-row');
                        const rowCb = boqRow.querySelector('input[type="checkbox"]');
                        if (rowCb) rowCb.checked = true;
                    }
                } else {
                    selectedItems = selectedItems.filter(i => i.rowIndex !== rowIndex);
                    const boqRow = document.querySelector(`#boq-tbody tr[data-row="${rowIndex}"]`);
                    if (boqRow) {
                        boqRow.classList.remove('highlighted-row');
                        const rowCb = boqRow.querySelector('input[type="checkbox"]');
                        if (rowCb) rowCb.checked = false;
                    }
                }
                updateBOQFloatingBar();
                // Keep search open so user can select more
            });

            const label = document.createElement('span');
            const displayText = row.filter(c => c && c !== 'nan').join(' | ');
            label.textContent = displayText.substring(0, 120);

            div.appendChild(checkbox);
            div.appendChild(label);

            div.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            searchResults.appendChild(div);
        });

        searchResults.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-container')) {
            searchResults.classList.add('hidden');
        }
    });

    // ─── SCROLL TO ROW ───────────────────────────────────────────────
    function scrollToRow(tbodyId, rowIndex) {
        const tbody = document.getElementById(tbodyId);
        const rows = tbody.querySelectorAll('tr');
        if (rows[rowIndex]) {
            rows[rowIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // ─── CONFIRMATION MODAL ──────────────────────────────────────────
    function showConfirmModal(row) {
        const itemName = row.filter(c => c && c !== 'nan' && c.trim() !== '').slice(0, 4).join(' › ');
        document.getElementById('modal-item-name').textContent = itemName;
        document.getElementById('confirm-modal').classList.remove('hidden');
    }

    function showMultiConfirmModal() {
        const names = selectedItems.map(i =>
            i.row.filter(c => c && c !== 'nan' && c.trim() !== '').slice(0, 4).join(' › ')
        ).join('\n');
        document.getElementById('modal-item-name').textContent = `${selectedItems.length} items selected:\n${names}`;
        document.getElementById('modal-item-name').style.whiteSpace = 'pre-line';
        document.getElementById('confirm-modal').classList.remove('hidden');
    }

    document.getElementById('modal-cancel').addEventListener('click', () => {
        document.getElementById('confirm-modal').classList.add('hidden');
        document.querySelectorAll('#boq-tbody input[type="checkbox"]').forEach(c => c.checked = false);
        selectedItems = [];
        updateBOQFloatingBar();
    });

    document.getElementById('modal-confirm').addEventListener('click', async () => {
        document.getElementById('confirm-modal').classList.add('hidden');
        searchResults.classList.add('hidden');
        boqSearch.value = '';
        switchTab('measurement');

        if (selectedItems.length > 0) {
            if (measurementData.length === 0) {
                await loadMeasurement();
            }

            const runMatching = async () => {
                for (const selItem of selectedItems) {
                    const boqRow = selItem.row;

                    // BOQ columns: TYPE(0) | NATURE(1) | CATEGORY(2) | SUB CATEGORY(3) | Particulars(4)
                    // Measurement sheet SUB CATEGORY column matches BOQ SUB CATEGORY (col 3)
                    // Don't assume fixed column index — scan all cells and try every meaningful value
                    // BOQ visible columns: SR NO | SUB CATEGORY | Particulars | UNIT | BOQ Qty
                    // SUB CATEGORY is the best match for measurement sheet
                    const orderedKeywords = [];

                    // Try every non-empty cell as a keyword, longest strings first (most specific)
                    const meaningfulCells = boqRow
                        .filter(val => val && val !== 'nan' && typeof val === 'string' && val.trim().length > 3)
                        .map(val => val.trim())
                        .sort((a, b) => b.length - a.length); // longest = most descriptive first

                    meaningfulCells.forEach(val => {
                        if (!orderedKeywords.includes(val)) orderedKeywords.push(val);
                    });

                    let matchRowIndex = -1;
                    let bestScore = 0;

                    for (const kw of orderedKeywords) {
                        const kwLower = kw.toLowerCase().trim();
                        const kwWords = kwLower.split(/\s+/).filter(w => w.length > 2);
                        if (kwWords.length === 0) continue;

                        let kwBestScore = 0;
                        let kwBestRow = -1;

                        measurementData.forEach((row, idx) => {
                            let score = 0;
                            for (const cell of row) {
                                const cellLower = cell.toString().toLowerCase().trim();
                                if (cellLower === kwLower) { score = 100; break; }
                                const matched = kwWords.filter(w => cellLower.includes(w)).length;
                                const ratio = matched / kwWords.length;
                                if (ratio === 1) score = Math.max(score, 50);
                                else if (ratio >= 0.75 && kwWords.length >= 3) score = Math.max(score, 20);
                            }
                            if (score > kwBestScore) { kwBestScore = score; kwBestRow = idx; }
                        });

                        if (kwBestScore > bestScore) { bestScore = kwBestScore; matchRowIndex = kwBestRow; }
                        if (bestScore >= 100) break;
                    }

                    selItem.matchRowIndex = matchRowIndex;
                    selItem.primaryKeyword = orderedKeywords[0] || '';

                    console.log('BOQ:', boqRow.filter(c=>c&&c!=='nan').join(' | '));
                    console.log('Keywords:', orderedKeywords);
                    console.log('Match:', matchRowIndex, 'Score:', bestScore, 'MeasData len:', measurementData.length);
                }
                renderAllMatchedSections();
            };

            if (measurementData.length === 0) {
                await loadMeasurement();
            }
            runMatching();
        }
    });

    // ─── NOTIFICATIONS ───────────────────────────────────────────────
    function showMatchNotification(itemName) {
        showNotification(`✅ Found in Measurement Sheet!<br><small>${itemName.substring(0, 60)}</small>`, '#2e7d32');
    }

    function showNoMatchNotification() {
        showNotification(`⚠️ Item not found in Measurement Sheet`, '#e65100');
    }

    function showNotification(html, color) {
        const existing = document.getElementById('snap-notification');
        if (existing) existing.remove();

        const notif = document.createElement('div');
        notif.id = 'snap-notification';
        notif.style.cssText = `
            position: fixed;
            top: 72px;
            right: 20px;
            background: ${color};
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            font-size: 0.9rem;
            z-index: 9999;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25);
            max-width: 320px;
            line-height: 1.5;
        `;
        notif.innerHTML = html;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 4000);
    }

    // ─── SUB-ITEM CONFIRMATION ───────────────────────────────────────
    let selectedSubItem = null;

    function showSubItemConfirm(cellText, row) {
        selectedSubItem = { cellText, row };
        document.getElementById('subitem-modal-name').textContent = cellText.substring(0, 100);
        document.getElementById('subitem-confirm-modal').classList.remove('hidden');
    }

    document.getElementById('subitem-modal-cancel').addEventListener('click', () => {
        document.getElementById('subitem-confirm-modal').classList.add('hidden');
        document.querySelectorAll('#measurement-tbody input[type="checkbox"]').forEach(c => {
            c.checked = false;
            if (c.closest('tr')) c.closest('tr').classList.remove('highlighted-row');
        });
        const tbody = document.getElementById('measurement-tbody');
        tbody.querySelectorAll('tr').forEach(r => {
            const rowCb = r.querySelector('input[type="checkbox"]');
            if (rowCb && rowCb.checked) r.classList.add('highlighted-row');
        });
    });

    document.getElementById('subitem-modal-confirm').addEventListener('click', () => {
        document.getElementById('subitem-confirm-modal').classList.add('hidden');
        if (selectedSubItem) {
            openUploadImagePage(selectedSubItem.cellText);
        }
    });

    // ─── UPLOAD IMAGE PAGE ───────────────────────────────────────────
    let currentPhoto = null;
    let measurementRect = null;
    let pixelsPerInch = 0;

    function openUploadImagePage(itemText) {
        document.getElementById('sheet-page').classList.add('hidden');
        document.getElementById('upload-image-page').classList.remove('hidden');
        const boqBar = document.getElementById('boq-floating-bar');
        const subBar = document.getElementById('subitem-floating-bar');
        if (boqBar) boqBar.style.display = 'none';
        if (subBar) subBar.style.display = 'none';

        // Init measurement storage for all sub-cats
        measurements = {};
        measurementQueue.forEach((_, idx) => { measurements[idx] = {}; });
        imageIndex = 0;
        rulerSetForCurrentImage = false;
        activeSubCatTab = 0;

        // Update headings from first sub-cat
        updateUploadHeading(0);

        goToStep(1);
        currentPhoto = null;
        measurementRect = null;
        pixelsPerInch = 0;
        document.getElementById('photo-input').value = '';
        document.getElementById('photo-upload-error').classList.add('hidden');
        document.getElementById('photo-upload-area').classList.remove('hidden');
    }

    function updateUploadHeading(idx) {
        const itemText = measurementQueue[idx]?.cellText || '';
        const parts = itemText.split('›').map(p => p.trim()).filter(Boolean);
        // Skip trailing junk: pure numbers, units like Nos/Sq.ft/Rmt, and single chars
        const junkPattern = /^(\d+(\.\d+)?|nos|sq\.?ft|rmt|rm|lm|kg|mtr|m|unit|units|no)$/i;
        const meaningfulParts = parts.filter(p => !junkPattern.test(p.trim()));
        const itemName = meaningfulParts[meaningfulParts.length - 1] || parts[parts.length - 1] || itemText;
        const particularChain = meaningfulParts.slice(0, -1).join(' › ');
        document.getElementById('upload-item-heading').textContent = itemName;
        document.getElementById('upload-item-subheading').textContent = particularChain ? `📁 ${particularChain}` : itemText;
        document.getElementById('selected-item-title').textContent = itemText.substring(0, 60);
    }

    function goToStep(step) {
        [1, 2, 3].forEach(s => {
            document.getElementById(`step${s}-content`).classList.add('hidden');
            const ind = document.getElementById(`step${s}-indicator`);
            ind.classList.remove('active', 'done');
            if (s < step) ind.classList.add('done');
            else if (s === step) ind.classList.add('active');
        });
        document.getElementById(`step${step}-content`).classList.remove('hidden');
    }

    // ─── STEP 1: PHOTO UPLOAD ────────────────────────────────────────
    const photoInput = document.getElementById('photo-input');
    photoInput.addEventListener('change', () => {
        if (photoInput.files[0]) handlePhotoSelect(photoInput.files[0]);
        // Multiple files: show count badge if more than 1 selected
        if (photoInput.files.length > 1) {
            document.getElementById('photo-upload-error').style.color = '#1565c0';
            document.getElementById('photo-upload-error').textContent =
                `📷 ${photoInput.files.length} images selected — measuring image 1 first`;
            document.getElementById('photo-upload-error').classList.remove('hidden');
        }
    });

    document.getElementById('photo-upload-area').addEventListener('click', (e) => {
    if (e.target.tagName === 'LABEL') return;
    photoInput.click();
});

    function handlePhotoSelect(file) {
        if (!file.type.match(/^image\//)) {
            document.getElementById('photo-upload-error').textContent = 'Please select an image file';
            document.getElementById('photo-upload-error').classList.remove('hidden');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            currentPhoto = new Image();
            currentPhoto.onload = () => {
                rulerSetForCurrentImage = false;
                pixelsPerInch = 0;
                goToStep(2);
                renderSubCatTabs();
                showRotationStep();
                // Add image button injected after rotation step replaces innerHTML
                setTimeout(() => injectAddImageButtonToStep2(), 50);
            };
            currentPhoto.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ─── CANVAS HELPER ───────────────────────────────────────────────
    function makeCanvas(canvasId) {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        const maxW = Math.min(container.clientWidth || window.innerWidth - 48, 900);
        const scale = maxW / currentPhoto.width;
        canvas.width = maxW;
        canvas.height = currentPhoto.height * scale;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        ctx.drawImage(currentPhoto, 0, 0, canvas.width, canvas.height);
        return { canvas, ctx, scaleRatio: scale };
    }

    function getPos(canvas, e) {
        const r = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - r.left) * (canvas.width / r.width),
            y: (clientY - r.top) * (canvas.height / r.height)
        };
    }

    function drawLine(ctx, p1, p2, color, label) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        [p1, p2].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });
        if (label) {
            ctx.fillStyle = color;
            ctx.font = 'bold 16px Arial';
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2 - 10;
            ctx.fillText(label, mx, my);
        }
    }

    function pixelDist(p1, p2) {
        return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }

    function pxToFtIn(px, ppi) {
        const totalInches = px / ppi;
        const totalFeet = totalInches / 12;
        // Display in feet only (decimal feet) with 2 decimal places
        const display = `${totalFeet.toFixed(2)} ft`;
        return { totalFeet, totalInches, display };
    }

    // ─── STEP 2: MARK RULER + LENGTH + BREADTH + (optional) HEIGHT ───
    // Clicks 1-2: ruler (cyan) → auto sets scale (1ft hardcoded)
    // Clicks 3-4: length (red)
    // Clicks 5-6: breadth (purple) → height modal pops up
    // Clicks 7-8: height (green, only if user says Yes)
    let lenCanvas, lenCtx, allPoints = [], measuredLength = null, measuredBreadth = null, measuredHeight = null;
    let dimensionMode = 'LB'; // 'LB' | 'LH' | 'BH'

    // ─── PERSPECTIVE CORRECTION (HOMOGRAPHY) ─────────────────────────
    function computeHomography(src, dst) {
    // Build 8x8 system Ah = b for homography
    const A = [];
    const bVec = [];
    for (let i = 0; i < 4; i++) {
        const sx = src[i].x, sy = src[i].y;
        const dx = dst[i].x, dy = dst[i].y;
        A.push([sx, sy, 1, 0,  0,  0, -dx*sx, -dx*sy]);
        A.push([0,  0,  0, sx, sy, 1, -dy*sx, -dy*sy]);
        bVec.push(dx);
        bVec.push(dy);
    }
    const h = gaussianElimination(A, bVec);
    return [h[0],h[1],h[2], h[3],h[4],h[5], h[6],h[7], 1.0];
}

function gaussianElimination(A, b) {
    const n = b.length;
    // Augment matrix
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        // Find pivot
        let maxRow = col;
        for (let row = col+1; row < n; row++) {
            if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
        }
        [M[col], M[maxRow]] = [M[maxRow], M[col]];
        if (Math.abs(M[col][col]) < 1e-10) continue;
        // Eliminate below
        for (let row = col+1; row < n; row++) {
            const factor = M[row][col] / M[col][col];
            for (let j = col; j <= n; j++) {
                M[row][j] -= factor * M[col][j];
            }
        }
    }
    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n-1; i >= 0; i--) {
        x[i] = M[i][n] / M[i][i];
        for (let j = i-1; j >= 0; j--) {
            M[j][n] -= M[j][i] * x[i];
        }
    }
    return x;
}

function applyHomography(H, p) {
    const w = H[6]*p.x + H[7]*p.y + H[8];
    if (Math.abs(w) < 1e-10) return {x: 0, y: 0};
    return {
        x: (H[0]*p.x + H[1]*p.y + H[2]) / w,
        y: (H[3]*p.x + H[4]*p.y + H[5]) / w
    };
}

    function warpCanvas(srcCanvas, corners, outW, outH) {
    const dst = document.createElement('canvas');
    dst.width = outW;
    dst.height = outH;
    const dstCtx = dst.getContext('2d');

    // Draw the full original image onto destination first (fills background)
    dstCtx.drawImage(srcCanvas, 0, 0, outW, outH);

    // Use CSS clip path via canvas path to show only the selected quadrilateral area
    // Then use CSS transform to straighten it
    // Better approach: use drawImage with source region via transform

    // Build transform: map selected corners → full output rectangle
    // We use a 2-step approach: clip to quad, then transform
    dstCtx.clearRect(0, 0, outW, outH);

    // Draw the warped quad using canvas clip + setTransform approach
    dstCtx.save();
    dstCtx.beginPath();
    dstCtx.moveTo(0, 0);
    dstCtx.lineTo(outW, 0);
    dstCtx.lineTo(outW, outH);
    dstCtx.lineTo(0, outH);
    dstCtx.closePath();
    dstCtx.clip();

    const dstCorners = [
        {x:0, y:0}, {x:outW, y:0},
        {x:outW, y:outH}, {x:0, y:outH}
    ];

    // Inverse homography: for each output pixel find source pixel
    const H = computeHomography(dstCorners, corners);
    const imgData = dstCtx.createImageData(outW, outH);
    const srcCtx = srcCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

    for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
            const sp = applyHomography(H, {x, y});
            // Bilinear interpolation for smoother result
            const sx = sp.x, sy = sp.y;
            const x0 = Math.floor(sx), y0 = Math.floor(sy);
            const x1 = x0 + 1, y1 = y0 + 1;
            const fx = sx - x0, fy = sy - y0;

            if (x0 >= 0 && x1 < srcCanvas.width && y0 >= 0 && y1 < srcCanvas.height) {
                const di = (y * outW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    const i00 = (y0 * srcCanvas.width + x0) * 4 + c;
                    const i10 = (y0 * srcCanvas.width + x1) * 4 + c;
                    const i01 = (y1 * srcCanvas.width + x0) * 4 + c;
                    const i11 = (y1 * srcCanvas.width + x1) * 4 + c;
                    imgData.data[di + c] = Math.round(
                        srcData.data[i00] * (1-fx) * (1-fy) +
                        srcData.data[i10] * fx * (1-fy) +
                        srcData.data[i01] * (1-fx) * fy +
                        srcData.data[i11] * fx * fy
                    );
                }
            }
        }
    }
    dstCtx.putImageData(imgData, 0, 0);
    dstCtx.restore();
    return dst;
}

    let cornerPoints = [];
    let correctedPhotoCanvas = null;
    function makeCanvasOnElement(canvasId) {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        const maxW = Math.min(container.clientWidth || window.innerWidth - 48, 900);
        const scale = maxW / currentPhoto.width;
        canvas.width = maxW;
        canvas.height = currentPhoto.height * scale;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        ctx.drawImage(currentPhoto, 0, 0, canvas.width, canvas.height);
        return { canvas, ctx, scaleRatio: scale };
    }
    function showRotationStep() {
        rotationAngle = 0;
        const step2 = document.getElementById('step2-content');
        step2.classList.remove('hidden');
        document.getElementById('step1-content').classList.add('hidden');

        step2.innerHTML = `
            <div class="instruction-box">
                <p>🔲 <strong>Select the 4 corners of the surface to straighten perspective</strong></p>
                <p class="instruction-sub">Click: Top-Left → Top-Right → Bottom-Right → Bottom-Left of the wall/floor/surface</p>
            </div>
            <div id="persp-status" style="font-weight:600;color:#e63900;padding:8px 0;text-align:center;">
                👆 Click Top-Left corner first
            </div>
            <canvas id="persp-canvas" style="max-width:100%;border-radius:10px;cursor:crosshair;touch-action:none;"></canvas>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:16px;flex-wrap:wrap;">
                <button id="persp-undo-btn" class="btn-cancel">↺ Undo Last Point</button>
                <button id="persp-reset-btn" class="btn-cancel">🔄 Reset</button>
                <button id="skip-rotation-btn" class="btn-cancel">Skip (Use Original)</button>
                <button id="apply-persp-btn" class="btn-confirm hidden">✅ Apply & Straighten →</button>
            </div>
        `;

        const canvas = document.getElementById('persp-canvas');
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        const maxW = Math.min(container.clientWidth || window.innerWidth - 48, 900);
        const scale = maxW / currentPhoto.width;
        canvas.width = maxW;
        canvas.height = currentPhoto.height * scale;

        const cornerLabels = ['TL', 'TR', 'BR', 'BL'];
        const cornerColors = ['#e63900', '#2e7d32', '#1565c0', '#f57f17'];
        let perspPoints = [];

        function redrawPersp() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(currentPhoto, 0, 0, canvas.width, canvas.height);

            // Draw lines between points
            if (perspPoints.length > 1) {
                ctx.strokeStyle = '#FFD600';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(perspPoints[0].x, perspPoints[0].y);
                for (let i = 1; i < perspPoints.length; i++) {
                    ctx.lineTo(perspPoints[i].x, perspPoints[i].y);
                }
                if (perspPoints.length === 4) {
                    ctx.lineTo(perspPoints[0].x, perspPoints[0].y);
                    ctx.fillStyle = 'rgba(255,214,0,0.12)';
                    ctx.fill();
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Draw corner dots + labels
            perspPoints.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
                ctx.fillStyle = cornerColors[i] + '33';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = cornerColors[i];
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = cornerColors[i];
                ctx.font = 'bold 14px Arial';
                ctx.fillText(cornerLabels[i], p.x + 12, p.y - 8);
            });
        }

        const statusMessages = [
            '👆 Click Top-Left corner first',
            '👆 Click Top-Right corner',
            '👆 Click Bottom-Right corner',
            '👆 Click Bottom-Left corner to complete'
        ];

        redrawPersp();

        function handleClick(pos) {
            if (perspPoints.length >= 4) return;
            perspPoints.push(pos);
            redrawPersp();

            if (perspPoints.length === 4) {
                document.getElementById('persp-status').textContent = '✅ Surface selected! Click Apply to straighten.';
                document.getElementById('persp-status').style.color = '#2e7d32';
                document.getElementById('apply-persp-btn').classList.remove('hidden');
            } else {
                document.getElementById('persp-status').textContent = statusMessages[perspPoints.length];
            }
        }

        let draggingPerspIndex = -1;
        let hoverPos = null;

        function getPerspHitIndex(pos) {
            for (let i = perspPoints.length - 1; i >= 0; i--) {
                const dx = perspPoints[i].x - pos.x, dy = perspPoints[i].y - pos.y;
                if (Math.sqrt(dx*dx + dy*dy) < 18) return i;
            }
            return -1;
        }

        function redrawPerspWithCrosshair(mousePos) {
            redrawPersp();
            if (!mousePos) return;
            // Draw crosshair lines
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            // Vertical line
            ctx.beginPath();
            ctx.moveTo(mousePos.x, 0);
            ctx.lineTo(mousePos.x, canvas.height);
            ctx.stroke();
            // Horizontal line
            ctx.beginPath();
            ctx.moveTo(0, mousePos.y);
            ctx.lineTo(canvas.width, mousePos.y);
            ctx.stroke();
            // Draw + label with coordinates
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            const labelX = mousePos.x + 10, labelY = mousePos.y - 8;
            const xPct = ((mousePos.x / canvas.width) * 100).toFixed(1);
            const yPct = ((mousePos.y / canvas.height) * 100).toFixed(1);
            const label = `x:${xPct}% y:${yPct}%`;
            ctx.font = 'bold 11px Arial';
            const tw = ctx.measureText(label).width;
            ctx.fillRect(labelX - 2, labelY - 13, tw + 6, 17);
            ctx.fillStyle = '#FFD600';
            ctx.fillText(label, labelX + 1, labelY);
            ctx.restore();
        }

        canvas.addEventListener('mousemove', (e) => {
            const r = canvas.getBoundingClientRect();
            const pos = {
                x: (e.clientX - r.left) * (canvas.width / r.width),
                y: (e.clientY - r.top) * (canvas.height / r.height)
            };
            hoverPos = pos;

            if (draggingPerspIndex !== -1) {
                perspPoints[draggingPerspIndex] = pos;
                if (perspPoints.length === 4) {
                    document.getElementById('persp-status').textContent = '✅ Surface selected! Click Apply to straighten.';
                    document.getElementById('persp-status').style.color = '#2e7d32';
                    document.getElementById('apply-persp-btn').classList.remove('hidden');
                }
                redrawPerspWithCrosshair(pos);
            } else {
                const hit = getPerspHitIndex(pos);
                canvas.style.cursor = hit !== -1 ? 'grab' : 'crosshair';
                redrawPerspWithCrosshair(pos);
            }
        });

        canvas.addEventListener('mouseleave', () => {
            hoverPos = null;
            redrawPersp();
        });

        canvas.addEventListener('mousedown', (e) => {
            const r = canvas.getBoundingClientRect();
            const pos = {
                x: (e.clientX - r.left) * (canvas.width / r.width),
                y: (e.clientY - r.top) * (canvas.height / r.height)
            };
            const hit = getPerspHitIndex(pos);
            if (hit !== -1) {
                draggingPerspIndex = hit;
                canvas.style.cursor = 'grabbing';
            }
        });

        canvas.addEventListener('mouseup', () => {
            draggingPerspIndex = -1;
            canvas.style.cursor = 'crosshair';
        });

        canvas.onclick = (e) => {
            if (draggingPerspIndex !== -1) return;
            const r = canvas.getBoundingClientRect();
            const pos = {
                x: (e.clientX - r.left) * (canvas.width / r.width),
                y: (e.clientY - r.top) * (canvas.height / r.height)
            };
            if (getPerspHitIndex(pos) !== -1) return; // clicked existing point, not new
            handleClick(pos);
        };

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const r = canvas.getBoundingClientRect();
            const t = e.touches[0];
            handleClick({
                x: (t.clientX - r.left) * (canvas.width / r.width),
                y: (t.clientY - r.top) * (canvas.height / r.height)
            });
        }, { passive: false });

        document.getElementById('persp-undo-btn').onclick = () => {
            if (perspPoints.length > 0) {
                perspPoints.pop();
                redrawPersp();
                document.getElementById('apply-persp-btn').classList.add('hidden');
                document.getElementById('persp-status').textContent = statusMessages[perspPoints.length];
                document.getElementById('persp-status').style.color = '#e63900';
            }
        };

        document.getElementById('persp-reset-btn').onclick = () => {
            perspPoints = [];
            redrawPersp();
            document.getElementById('apply-persp-btn').classList.add('hidden');
            document.getElementById('persp-status').textContent = statusMessages[0];
            document.getElementById('persp-status').style.color = '#e63900';
        };

        document.getElementById('skip-rotation-btn').onclick = () => {
            restoreStep2AndSetup();
        };

        document.getElementById('apply-persp-btn').onclick = () => {
        if (perspPoints.length !== 4) return;

        // Calculate natural output size from the selected quad (no zoom)
const topEdge = Math.sqrt(Math.pow(perspPoints[1].x - perspPoints[0].x, 2) + Math.pow(perspPoints[1].y - perspPoints[0].y, 2));
const bottomEdge = Math.sqrt(Math.pow(perspPoints[2].x - perspPoints[3].x, 2) + Math.pow(perspPoints[2].y - perspPoints[3].y, 2));
const leftEdge = Math.sqrt(Math.pow(perspPoints[3].x - perspPoints[0].x, 2) + Math.pow(perspPoints[3].y - perspPoints[0].y, 2));
const rightEdge = Math.sqrt(Math.pow(perspPoints[2].x - perspPoints[1].x, 2) + Math.pow(perspPoints[2].y - perspPoints[1].y, 2));
const outW = Math.round((topEdge + bottomEdge) / 2);
const outH = Math.round((leftEdge + rightEdge) / 2);

        // Draw clean photo onto a fresh offscreen canvas — no dots/lines
        const cleanCanvas = document.createElement('canvas');
        cleanCanvas.width = canvas.width;
        cleanCanvas.height = canvas.height;
        const cleanCtx = cleanCanvas.getContext('2d');
        cleanCtx.drawImage(currentPhoto, 0, 0, canvas.width, canvas.height);

        const warped = warpCanvas(cleanCanvas, perspPoints, outW, outH);

        const newImg = new Image();
        newImg.onload = () => {
            currentPhoto = newImg;

            // ── PRESERVE RULER SCALE AFTER WARP ──
            // The warp changes pixel distances, so we must lock in the
            // pre-warp pixelsPerInch (if ruler was already set) 
            // OR force user to re-mark ruler on the corrected image.
            // Best approach: carry forward the raw pixelsPerInch but
            // adjust it by how much the warp scaled the image content.
            //
            // We calculate how much the TOP edge of the selected quad
            // changed in pixel length after warp (outW = full canvas width),
            // then scale pixelsPerInch proportionally.
            if (rulerSetForCurrentImage && pixelsPerInch > 0) {
                // Top edge of quad before warp (in canvas pixels)
                const preWarpTopEdge = Math.sqrt(
                    Math.pow(perspPoints[1].x - perspPoints[0].x, 2) +
                    Math.pow(perspPoints[1].y - perspPoints[0].y, 2)
                );
                // After warp, top edge spans full outW
                const postWarpTopEdge = outW;
                const scaleFactor = postWarpTopEdge / preWarpTopEdge;
                pixelsPerInch = pixelsPerInch * scaleFactor;
            }

            restoreStep2AndSetup();
        };
        newImg.src = warped.toDataURL();
        };
    }

    function restoreStep2AndSetup() {
        document.getElementById('step2-content').innerHTML = originalStep2HTML;
        document.getElementById('step2-content').classList.remove('hidden');
        renderSubCatTabs();
        setupLengthCanvas();
        injectAddImageButtonToStep2();
    }
    function restoreStep2AndSetupCornersOnly() {
        document.getElementById('step2-content').innerHTML = originalStep2HTML;
        document.getElementById('step2-content').classList.remove('hidden');
        setupLengthCanvasCornersOnly();
        injectAddImageButtonToStep2();
    }

    function setupLengthCanvasCornersOnly() {
        cornerPoints = [];
        allPoints = [];
        measuredLength = null;
        measuredBreadth = null;
        measuredHeight = null;

        document.getElementById('confirm-dimensions-btn').classList.add('hidden');
        document.getElementById('corner-canvas').style.display = '';

        const setup = makeCanvasOnElement('corner-canvas');
        const cornerCanvas = setup.canvas;
        const cornerCtx = setup.ctx;
        const cornerLabels = ['TL', 'TR', 'BR', 'BL'];
        let draggingIndex = -1;

        // Jump straight to corners — ruler already set
        phase = 'corners';
        document.getElementById('dimension-status').textContent =
            `🟡 [${measurementQueue[activeSubCatTab]?.cellText?.split('›').pop()?.trim()}] Click 4 corners: TL → TR → BR → BL`;
        document.getElementById('dimension-status').style.color = '#f57f17';

        // Show dimension choice modal immediately for this sub-cat
        document.getElementById('dimension-choice-modal').classList.remove('hidden');

        redraw = function() {
            cornerCtx.clearRect(0, 0, cornerCanvas.width, cornerCanvas.height);
            cornerCtx.drawImage(currentPhoto, 0, 0, cornerCanvas.width, cornerCanvas.height);

            // Draw ruler reference
            if (rulerPoints.length === 2) {
                drawLine(cornerCtx, rulerPoints[0], rulerPoints[1], '#00e5ff', '1ft Ruler ✓');
            }

            // Draw previous sub-cat measurements faintly
            measurementQueue.forEach((_, idx) => {
                if (idx !== activeSubCatTab && measurements[idx]?.[imageIndex]?.cornerPoints) {
                    const pts = measurements[idx][imageIndex].cornerPoints;
                    cornerCtx.strokeStyle = 'rgba(200,200,200,0.5)';
                    cornerCtx.lineWidth = 1;
                    cornerCtx.setLineDash([4, 4]);
                    cornerCtx.beginPath();
                    pts.forEach((p, i) => i === 0 ? cornerCtx.moveTo(p.x, p.y) : cornerCtx.lineTo(p.x, p.y));
                    cornerCtx.closePath();
                    cornerCtx.stroke();
                    cornerCtx.setLineDash([]);
                }
            });

            if (cornerPoints.length === 0) return;
            if (cornerPoints.length === 4) {
                cornerCtx.fillStyle = 'rgba(255,214,0,0.15)';
                cornerCtx.beginPath();
                cornerCtx.moveTo(cornerPoints[0].x, cornerPoints[0].y);
                cornerPoints.forEach(p => cornerCtx.lineTo(p.x, p.y));
                cornerCtx.closePath();
                cornerCtx.fill();
            }
            cornerCtx.strokeStyle = '#FFD600';
            cornerCtx.lineWidth = 2;
            cornerCtx.setLineDash([5, 4]);
            cornerCtx.beginPath();
            cornerCtx.moveTo(cornerPoints[0].x, cornerPoints[0].y);
            for (let i = 1; i < cornerPoints.length; i++) cornerCtx.lineTo(cornerPoints[i].x, cornerPoints[i].y);
            if (cornerPoints.length === 4) cornerCtx.lineTo(cornerPoints[0].x, cornerPoints[0].y);
            cornerCtx.stroke();
            cornerCtx.setLineDash([]);

            cornerPoints.forEach((p, i) => {
                cornerCtx.beginPath();
                cornerCtx.arc(p.x, p.y, 14, 0, Math.PI * 2);
                cornerCtx.fillStyle = 'rgba(255,214,0,0.25)';
                cornerCtx.fill();
                cornerCtx.beginPath();
                cornerCtx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                cornerCtx.fillStyle = '#FFD600';
                cornerCtx.fill();
                cornerCtx.strokeStyle = 'white';
                cornerCtx.lineWidth = 2;
                cornerCtx.stroke();
                cornerCtx.fillStyle = '#FFD600';
                cornerCtx.font = 'bold 13px Arial';
                cornerCtx.fillText(cornerLabels[i], p.x + 12, p.y - 10);
            });
        };

        cornerCanvas.onclick = (e) => {
            if (draggingIndex !== -1) return;
            const pos = getPos(cornerCanvas, e);
            if (phase === 'corners' && cornerPoints.length < 4) {
                cornerPoints.push(pos);
                redraw();
                if (cornerPoints.length === 4) calculateAndShowForSubCat();
            }
        };

        function getHitIndex(pos) {
            for (let i = cornerPoints.length - 1; i >= 0; i--) {
                const dx = cornerPoints[i].x - pos.x, dy = cornerPoints[i].y - pos.y;
                if (Math.sqrt(dx*dx + dy*dy) < 20) return i;
            }
            return -1;
        }

        cornerCanvas.addEventListener('mousedown', (e) => { draggingIndex = getHitIndex(getPos(cornerCanvas, e)); });
        cornerCanvas.addEventListener('mousemove', (e) => {
            const pos = getPos(cornerCanvas, e);
            if (draggingIndex !== -1) { cornerPoints[draggingIndex] = pos; redraw(); if (cornerPoints.length === 4) calculateAndShowForSubCat(); }
            cornerCanvas.style.cursor = getHitIndex(pos) !== -1 ? 'grab' : 'crosshair';
        });
        cornerCanvas.addEventListener('mouseup', () => { draggingIndex = -1; });
    }
    function setupLengthCanvas() {
        cornerPoints = [];
        correctedPhotoCanvas = null;
        allPoints = [];
        measuredLength = null;
        measuredBreadth = null;
        measuredHeight = null;
        pixelsPerInch = 0;

        document.getElementById('confirm-dimensions-btn').classList.add('hidden');
        document.getElementById('corner-canvas').style.display = '';
        document.getElementById('length-canvas').style.display = 'none';

        const setup = makeCanvasOnElement('corner-canvas');
        const cornerCanvas = setup.canvas;
        const cornerCtx = setup.ctx;

        const cornerLabels = ['TL', 'TR', 'BR', 'BL'];
        let draggingIndex = -1;
        // Phase: 'ruler' first, then 'corners'
        phase = 'ruler';
    rulerPoints = [];

        document.getElementById('dimension-status').textContent = '🟦 Click 2 ends of the 1ft ruler first';
        document.getElementById('dimension-status').style.color = '#00838f';

        redraw = function() {
            cornerCtx.clearRect(0, 0, cornerCanvas.width, cornerCanvas.height);
            cornerCtx.drawImage(currentPhoto, 0, 0, cornerCanvas.width, cornerCanvas.height);

            // Draw ruler line
            if (rulerPoints.length >= 1) {
                drawDotOn(cornerCtx, rulerPoints[0], '#00e5ff');
            }
            if (rulerPoints.length === 2) {
                drawLine(cornerCtx, rulerPoints[0], rulerPoints[1], '#00e5ff', '1ft Ruler ✓');
            }

            // Draw corner polygon
            if (cornerPoints.length === 0) return;

            if (cornerPoints.length === 4) {
                cornerCtx.fillStyle = 'rgba(255,214,0,0.15)';
                cornerCtx.beginPath();
                cornerCtx.moveTo(cornerPoints[0].x, cornerPoints[0].y);
                cornerPoints.forEach(p => cornerCtx.lineTo(p.x, p.y));
                cornerCtx.closePath();
                cornerCtx.fill();
            }

            cornerCtx.strokeStyle = '#FFD600';
            cornerCtx.lineWidth = 2;
            cornerCtx.setLineDash([5, 4]);
            cornerCtx.beginPath();
            cornerCtx.moveTo(cornerPoints[0].x, cornerPoints[0].y);
            for (let i = 1; i < cornerPoints.length; i++) {
                cornerCtx.lineTo(cornerPoints[i].x, cornerPoints[i].y);
            }
            if (cornerPoints.length === 4) {
                cornerCtx.lineTo(cornerPoints[0].x, cornerPoints[0].y);
            }
            cornerCtx.stroke();
            cornerCtx.setLineDash([]);

            cornerPoints.forEach((p, i) => {
                cornerCtx.beginPath();
                cornerCtx.arc(p.x, p.y, 14, 0, Math.PI * 2);
                cornerCtx.fillStyle = 'rgba(255,214,0,0.25)';
                cornerCtx.fill();
                cornerCtx.beginPath();
                cornerCtx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                cornerCtx.fillStyle = '#FFD600';
                cornerCtx.fill();
                cornerCtx.strokeStyle = 'white';
                cornerCtx.lineWidth = 2;
                cornerCtx.stroke();
                cornerCtx.fillStyle = '#FFD600';
                cornerCtx.font = 'bold 13px Arial';
                cornerCtx.fillText(cornerLabels[i], p.x + 12, p.y - 10);
            });
        }

        function drawDotOn(ctx, pos, color) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        function calculateAndShow() {
            const topWidth = pixelDist(cornerPoints[0], cornerPoints[1]);
            const bottomWidth = pixelDist(cornerPoints[3], cornerPoints[2]);
            const avgWidth = (topWidth + bottomWidth) / 2;
            const leftHeight = pixelDist(cornerPoints[0], cornerPoints[3]);
            const rightHeight = pixelDist(cornerPoints[1], cornerPoints[2]);
            const avgHeight = (leftHeight + rightHeight) / 2;

            const newLength = pxToFtIn(avgWidth, pixelsPerInch);
            const newBreadth = pxToFtIn(avgHeight, pixelsPerInch);
            measuredHeight = null;
            dimensionMode = 'LB';

            const prev = measurements[activeSubCatTab]?.[imageIndex] || {};
            const prevLengthFt = prev.lengthFt || 0;
            const totalLengthFt = prevLengthFt + newLength.totalFeet;
            const prevBreadthFt = prev.breadthFt || 0;
            const totalBreadthFt = prevBreadthFt + newBreadth.totalFeet;
            const areaSqFt = totalLengthFt * totalBreadthFt;

            measuredLength = { totalFeet: totalLengthFt, totalInches: totalLengthFt * 12, display: `${totalLengthFt.toFixed(2)} ft` };
            measuredBreadth = { totalFeet: totalBreadthFt, totalInches: totalBreadthFt * 12, display: `${totalBreadthFt.toFixed(2)} ft` };

            document.getElementById('dimension-status').textContent =
                `✅ L: ${measuredLength.display}${prevLengthFt > 0 ? ` (prev ${prevLengthFt.toFixed(2)} + new ${newLength.totalFeet.toFixed(2)})` : ''} | B: ${measuredBreadth.display}${prevBreadthFt > 0 ? ` (prev ${prevBreadthFt.toFixed(2)} + new ${newBreadth.totalFeet.toFixed(2)})` : ''} | Area: ${areaSqFt.toFixed(2)} sq.ft`;
            document.getElementById('dimension-status').style.color = '#2e7d32';

            const lengthSegments = [...(prev.lengthSegments || []), {
                p1: cornerPoints[0], p2: cornerPoints[1],
                totalFeet: newLength.totalFeet, totalInches: newLength.totalInches,
                fromLB: true
            }];

            measurements[activeSubCatTab][imageIndex] = {
                ...prev,
                lengthFt: totalLengthFt,
                breadthFt: totalBreadthFt,
                heightFt: 0,
                areaSqFt,
                lengthInches: totalLengthFt * 12,
                breadthInches: totalBreadthFt * 12,
                heightInches: 0,
                cornerPoints: [...cornerPoints],
                lengthSegments,
                breadthSegments: [{ p1: cornerPoints[0], p2: cornerPoints[3], totalFeet: totalBreadthFt, totalInches: totalBreadthFt * 12, fromLB: true }],
                segments: [],
                segmentType: 'LB'
            };
            rulerSetForCurrentImage = true;
            renderSubCatTabs();

            document.getElementById('result-length').textContent = measuredLength.display;
            document.getElementById('result-breadth').textContent = measuredBreadth.display;
            document.getElementById('result-height').textContent = 'NA';
            document.getElementById('result-area').textContent = `${areaSqFt.toFixed(2)} sq.ft`;
            document.getElementById('result-length-row').style.opacity = '1';
            document.getElementById('result-breadth-row').style.opacity = '1';
            document.getElementById('result-height-row').style.opacity = '0.4';

            setTimeout(() => {
                goToStep(3);
                renderResultsSummary();
            }, 600);
        }

        // Click handler
        cornerCanvas.onclick = (e) => {
            if (draggingIndex !== -1) return;
            const pos = getPos(cornerCanvas, e);

            if (phase === 'ruler') {
                rulerPoints.push(pos);
                if (rulerPoints.length === 2) {
        const rulerPixels = pixelDist(rulerPoints[0], rulerPoints[1]);
        pixelsPerInch = rulerPixels / 12;
        rulerSetForCurrentImage = true; // ← ADD THIS
        phase = 'waiting';
        document.getElementById('dimension-status').textContent = '✅ Ruler set! Choose what to measure →';
        document.getElementById('dimension-status').style.color = '#2e7d32';
        document.getElementById('dimension-choice-modal').classList.remove('hidden');
    }
                redraw();
                return;
            }

            if (phase === 'corners' && cornerPoints.length < 4) {
                cornerPoints.push(pos);
                redraw();
            if (cornerPoints.length === 1) {
        document.getElementById('dimension-status').textContent = '🟡 Now click TR (top-right) for LENGTH';
    } else if (cornerPoints.length === 2) {
        const lengthSoFar = pxToFtIn(pixelDist(cornerPoints[0], cornerPoints[1]), pixelsPerInch);
        document.getElementById('dimension-status').textContent = 
            `📏 Length: ${lengthSoFar.display} ✅ Now click BR (bottom-right) for BREADTH`;
        document.getElementById('dimension-status').style.color = '#7b1fa2';
    } else if (cornerPoints.length === 3) {
        const breadthSoFar = pxToFtIn(pixelDist(cornerPoints[1], cornerPoints[2]), pixelsPerInch);
        document.getElementById('dimension-status').textContent = 
            `📐 Breadth: ${breadthSoFar.display} ✅ Now click BL (bottom-left) to close`;
        document.getElementById('dimension-status').style.color = '#e65100';
    }else {
                    calculateAndShow();
                }
            }
        };

        // Drag support
        function getHitIndex(pos) {
            for (let i = cornerPoints.length - 1; i >= 0; i--) {
                const dx = cornerPoints[i].x - pos.x;
                const dy = cornerPoints[i].y - pos.y;
                if (Math.sqrt(dx * dx + dy * dy) < 20) return i;
            }
            return -1;
        }

        cornerCanvas.addEventListener('mousedown', (e) => {
            const pos = getPos(cornerCanvas, e);
            draggingIndex = getHitIndex(pos);
        });

        cornerCanvas.addEventListener('mousemove', (e) => {
            const pos = getPos(cornerCanvas, e);
            if (draggingIndex !== -1) {
                cornerPoints[draggingIndex] = pos;
                redraw();
                if (cornerPoints.length === 4) calculateAndShow();
            }
            cornerCanvas.style.cursor = getHitIndex(pos) !== -1 ? 'grab' : 'crosshair';
        });

        cornerCanvas.addEventListener('mouseup', () => {
            draggingIndex = -1;
            cornerCanvas.style.cursor = 'crosshair';
        });

        // Touch support
        cornerCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const pos = getPos(cornerCanvas, e);
            const hit = getHitIndex(pos);
            if (hit !== -1) {
                draggingIndex = hit;
            } else if (phase === 'ruler' && rulerPoints.length < 2) {
                rulerPoints.push(pos);
                if (rulerPoints.length === 2) {
        const rulerPixels = pixelDist(rulerPoints[0], rulerPoints[1]);
        pixelsPerInch = rulerPixels / 12;
        rulerSetForCurrentImage = true; // ← ADD THIS
        phase = 'waiting';
        document.getElementById('dimension-status').textContent = '✅ Ruler set! Choose what to measure →';
        document.getElementById('dimension-status').style.color = '#2e7d32';
        document.getElementById('dimension-choice-modal').classList.remove('hidden');
    }
                redraw();
            } else if (phase === 'corners' && cornerPoints.length < 4) {
                cornerPoints.push(pos);
                redraw();
                if (cornerPoints.length === 4) calculateAndShow();
            }
        }, { passive: false });

        cornerCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (draggingIndex !== -1) {
                const pos = getPos(cornerCanvas, e);
                cornerPoints[draggingIndex] = pos;
                redraw();
                if (cornerPoints.length === 4) calculateAndShow();
            }
        }, { passive: false });

        cornerCanvas.addEventListener('touchend', () => {
            draggingIndex = -1;
        });
    }
    function drawDot(ctx, pos, color) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#reset-length-btn')) return;

        if (phase === 'corners' && cornerPoints.length > 0) {
            cornerPoints.pop();
            if (redraw) redraw();
            document.getElementById('confirm-dimensions-btn').classList.add('hidden');
            if (cornerPoints.length === 0) {
                document.getElementById('dimension-status').textContent = '🟡 Now click 4 corners: TL → TR → BR → BL';
                document.getElementById('dimension-status').style.color = '#f57f17';
            } else if (cornerPoints.length === 1) {
                document.getElementById('dimension-status').textContent = '🟡 Now click TR (top-right) for LENGTH';
                document.getElementById('dimension-status').style.color = '#f57f17';
            } else if (cornerPoints.length === 2) {
                document.getElementById('dimension-status').textContent = '📏 Now click BR (bottom-right) for BREADTH';
                document.getElementById('dimension-status').style.color = '#7b1fa2';
            } else if (cornerPoints.length === 3) {
                document.getElementById('dimension-status').textContent = '📐 Now click BL (bottom-left) to close';
                document.getElementById('dimension-status').style.color = '#e65100';
            }
        } else if (phase === 'waiting') {
            rulerPoints = [];
            phase = 'ruler';
            pixelsPerInch = 0;
            if (redraw) redraw();
            document.getElementById('dimension-status').textContent = '🟦 Click 2 ends of the 1ft ruler first';
            document.getElementById('dimension-status').style.color = '#00838f';
        } else if (phase === 'ruler' && rulerPoints.length > 0) {
            rulerPoints.pop();
            if (redraw) redraw();
            document.getElementById('dimension-status').textContent = '🟦 Click 2 ends of the 1ft ruler first';
            document.getElementById('dimension-status').style.color = '#00838f';
        } else {
            document.getElementById('step2-content').innerHTML = originalStep2HTML;
            document.getElementById('step2-content').classList.remove('hidden');
            showRotationStep();
        }
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#confirm-dimensions-btn')) return;
        document.getElementById('confirm-dimensions-btn').classList.add('hidden');
        document.getElementById('dimension-choice-modal').classList.remove('hidden');
    });

    // Length × Breadth — no height needed
    // ─── MODE: LENGTH ONLY ───────────────────────────────────────────
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#choice-length-only')) return;
        document.getElementById('dimension-choice-modal').classList.add('hidden');
        startMultiLineMode('length');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#choice-breadth-only')) return;
        document.getElementById('dimension-choice-modal').classList.add('hidden');
        startMultiLineMode('breadth');
    });

    // ─── MODE: LENGTH + BREADTH (existing 4-corner flow) ─────────────
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#choice-lb')) return;
        document.getElementById('dimension-choice-modal').classList.add('hidden');
        dimensionMode = 'LB';
        measuredHeight = null;
        phase = 'corners';
        cornerPoints = [];
        document.getElementById('dimension-status').textContent = '🟡 Now click 4 corners: TL → TR → BR → BL';
        document.getElementById('dimension-status').style.color = '#f57f17';
        if (redraw) redraw();
    });
    function startHeightMarking() {
        const cornerCanvas = document.getElementById('corner-canvas');
        const cornerCtx = cornerCanvas.getContext('2d');
        let heightPoints = [];

        // Remove old onclick to avoid conflict
        cornerCanvas.onclick = (e) => {
            if (heightPoints.length >= 2) return;
            const pos = getPos(cornerCanvas, e);
            heightPoints.push(pos);

            cornerCtx.beginPath();
            cornerCtx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
            cornerCtx.fillStyle = '#2e7d32';
            cornerCtx.fill();
            cornerCtx.strokeStyle = 'white';
            cornerCtx.lineWidth = 2;
            cornerCtx.stroke();

            if (heightPoints.length === 2) {
                const dist = pixelDist(heightPoints[0], heightPoints[1]);
                measuredHeight = pxToFtIn(dist, pixelsPerInch);
                drawLine(cornerCtx, heightPoints[0], heightPoints[1], '#2e7d32', measuredHeight.display);
                document.getElementById('dimension-status').textContent =
                    `✅ Height: ${measuredHeight.display} — Done!`;
                document.getElementById('dimension-status').style.color = '#2e7d32';
                setTimeout(() => showResult(), 500);
            } else {
                document.getElementById('dimension-status').textContent = '🟢 Click 2nd point for HEIGHT';
            }
        };
    }

    function showResult() {
        if (dimensionMode === 'LENGTH_ONLY' || dimensionMode === 'BREADTH_ONLY') {
            const isLength = dimensionMode === 'LENGTH_ONLY';
            const total = isLength ? measuredLength.totalFeet : measuredBreadth.totalFeet;
            const lines = isLength ? multiLengths : multiBreadths;

            measurements[activeSubCatTab][imageIndex] = {
                lengthFt: isLength ? total : 0,
                breadthFt: isLength ? 0 : total,
                heightFt: 0,
                areaSqFt: total,
                lengthInches: isLength ? total * 12 : 0,
                breadthInches: isLength ? 0 : total * 12,
                heightInches: 0,
                cornerPoints: [],
                segments: lines.map(l => ({ ...l })),
                segmentType: isLength ? 'length' : 'breadth'
            };

            rulerSetForCurrentImage = true;
    goToStep(3);
    renderSubCatTabs();
    renderResultsSummary();
            return;
        }

        let lengthFt = 0, breadthFt = 0, heightFt = 0, areaSqFt = 0;

        if (dimensionMode === 'LB') {
            lengthFt = measuredLength.totalFeet;
            breadthFt = measuredBreadth.totalFeet;
            areaSqFt = lengthFt * breadthFt;
            document.getElementById('result-length').textContent = measuredLength.display;
            document.getElementById('result-breadth').textContent = measuredBreadth.display;
            document.getElementById('result-height').textContent = 'NA';
            document.getElementById('result-length-row').style.opacity = '1';
            document.getElementById('result-breadth-row').style.opacity = '1';
            document.getElementById('result-height-row').style.display = '';
            document.getElementById('result-height-row').style.opacity = '0.4';
        } else if (dimensionMode === 'LH') {
            lengthFt = measuredLength.totalFeet;
            heightFt = measuredHeight.totalFeet;
            areaSqFt = lengthFt * heightFt;
            document.getElementById('result-length').textContent = measuredLength.display;
            document.getElementById('result-breadth').textContent = 'NA';
            document.getElementById('result-height').textContent = measuredHeight.display;
            document.getElementById('result-length-row').style.opacity = '1';
            document.getElementById('result-breadth-row').style.opacity = '0.4';
            document.getElementById('result-height-row').style.display = '';
            document.getElementById('result-height-row').style.opacity = '1';
        } else if (dimensionMode === 'BH') {
            breadthFt = measuredBreadth.totalFeet;
            heightFt = measuredHeight.totalFeet;
            areaSqFt = breadthFt * heightFt;
            document.getElementById('result-length').textContent = 'NA';
            document.getElementById('result-breadth').textContent = measuredBreadth.display;
            document.getElementById('result-height').textContent = measuredHeight.display;
            document.getElementById('result-length-row').style.opacity = '0.4';
            document.getElementById('result-breadth-row').style.opacity = '1';
            document.getElementById('result-height-row').style.display = '';
            document.getElementById('result-height-row').style.opacity = '1';
        }

        document.getElementById('result-area').textContent = `${areaSqFt.toFixed(2)} Sq.ft`;

        // Store measurement for this sub-cat + image
        measurements[activeSubCatTab][imageIndex] = {
            lengthFt, breadthFt, heightFt, areaSqFt,
            lengthInches: measuredLength ? measuredLength.totalInches : 0,
            breadthInches: measuredBreadth ? measuredBreadth.totalInches : 0,
            heightInches: measuredHeight ? measuredHeight.totalInches : 0,
            cornerPoints: [...cornerPoints]
        };

        measurementRect = {
            lengthFt, breadthFt, heightFt, areaSqFt,
            lengthInches: measuredLength ? measuredLength.totalInches : 0,
            breadthInches: measuredBreadth ? measuredBreadth.totalInches : 0,
            heightInches: measuredHeight ? measuredHeight.totalInches : 0,
        };

        rulerSetForCurrentImage = true;
        renderSubCatTabs();
        goToStep(3);
        renderResultsSummary();
    }

    document.getElementById('remeasure-btn').addEventListener('click', () => {
        goToStep(2);
        renderSubCatTabs();
        setupLengthCanvas();
    });

    // ─── STEP 3: SAVE ────────────────────────────────────────────────
    document.getElementById('save-result-btn').addEventListener('click', async () => {
        document.getElementById('save-loading').classList.remove('hidden');
        document.getElementById('save-result-btn').disabled = true;

        try {
            for (const [subIdxStr, imgMeasurements] of Object.entries(measurements)) {
                const subIdx = parseInt(subIdxStr);
                const item = measurementQueue[subIdx];
                if (!item) continue;
                const imageKeys = Object.keys(imgMeasurements);
                if (imageKeys.length === 0) continue;

                // Sum ALL across images — L and B accumulate, area is total
                let totalLength = 0, totalBreadth = 0, totalArea = 0, totalHeight = 0;
                imageKeys.forEach(imgIdx => {
                    const m = imgMeasurements[imgIdx];
                    totalLength += m.lengthFt;
                    totalBreadth += m.breadthFt;
                    totalArea += m.areaSqFt;
                    totalHeight += m.heightFt;
                });
                const imgCount = 1; // L and B are already summed across images; Nos=1 prevents double-multiplication in Excel

                // Recalculate area from summed L × B (if both present), else use accumulated area
                const finalArea = totalLength > 0 && totalBreadth > 0
                    ? totalLength * totalBreadth
                    : totalArea;

                const payload = {
                    filename: uploadedFilename,
                    item_name: item.cellText,
                    row_index: item.rowIndex,
                    length_ft: totalLength,
                    breadth_ft: totalBreadth,
                    area_sqft: finalArea,
                    height_ft: totalHeight,
                    length_inches: totalLength * 12,
                    breadth_inches: totalBreadth * 12,
                    height_inches: totalHeight * 12,
                    photo_nos: imgCount,
                    photo_L: totalLength > 0 ? totalLength.toFixed(3) : 'NA',
                    photo_B: totalBreadth > 0 ? totalBreadth.toFixed(3) : 'NA',
                    photo_DH: totalHeight > 0 ? totalHeight.toFixed(3) : 'NA'
                };

                const res = await fetch('/save-measurement', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || `Failed for ${item.cellText}`);
            }

            // All saved
            document.getElementById('queue-assign-box').style.display = 'none';
            document.getElementById('remeasure-btn').style.display = 'none';
            document.getElementById('save-result-btn').style.display = 'none';
            const addBtn = document.getElementById('add-image-btn');
            if (addBtn) addBtn.remove();
            const tabBar = document.getElementById('subcat-tab-bar');
            if (tabBar) tabBar.remove();

            document.getElementById('save-success').innerHTML = `
                <div style="text-align:center;padding:16px;">
                    <div style="font-size:2.5rem;">🎉</div>
                    <div style="font-size:1.2rem;font-weight:700;color:#2e7d32;margin:8px 0;">
                        All Items Saved!
                    </div>
                    <div style="color:#555;margin-bottom:20px;font-size:0.9rem;">
                        Your Excel file is ready to download.
                    </div>
                    <button id="final-download-btn" style="
                        background:#2e7d32;color:white;border:none;
                        padding:14px 32px;border-radius:32px;
                        font-size:1rem;font-weight:700;cursor:pointer;
                        box-shadow:0 4px 16px rgba(0,0,0,0.2);
                    ">📥 Download Excel</button>
                </div>
            `;
            document.getElementById('save-success').classList.remove('hidden');
            document.getElementById('final-download-btn').addEventListener('click', () => {
                window.location.href = `/download-excel?filename=${encodeURIComponent(uploadedFilename)}`;
            });

        } catch (err) {
            document.getElementById('save-error').textContent = err.message || 'Save failed.';
            document.getElementById('save-error').classList.remove('hidden');
        } finally {
            document.getElementById('save-loading').classList.add('hidden');
            document.getElementById('save-result-btn').disabled = false;
        }
    });
    // ─── CANVAS HELPERS ───────────────────────────────────────────────
    function drawImageOnCanvas(ctx, canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(currentPhoto, 0, 0, canvas.width, canvas.height);
    }

    function drawRect(ctx, start, end, color) {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = color + '22';
        ctx.fillRect(x, y, w, h);
    }

    function getCanvasPos(canvas, e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // ─── SEARCH IN MEASUREMENT ───────────────────────────────────────
    const measurementSearch = document.getElementById('measurement-search');
    const measurementSearchResults = document.getElementById('measurement-search-results');

    measurementSearch.addEventListener('input', () => {
        const query = measurementSearch.value.trim().toLowerCase();
        if (query.length < 2) {
            measurementSearchResults.classList.add('hidden');
            return;
        }

        if (measurementData.length === 0) {
            measurementSearchResults.innerHTML = '<div style="padding:12px;color:#999">Load measurement sheet first</div>';
            measurementSearchResults.classList.remove('hidden');
            return;
        }

        const matches = [];
        measurementData.forEach((row, rowIndex) => {
            const rowText = row.join(' ').toLowerCase();
            if (rowText.includes(query)) {
                matches.push({ row, rowIndex });
            }
        });

        if (matches.length === 0) {
            measurementSearchResults.innerHTML = '<div style="padding:12px;color:#999">No results found</div>';
            measurementSearchResults.classList.remove('hidden');
            return;
        }

        measurementSearchResults.innerHTML = '';
        matches.slice(0, 20).forEach(({ row, rowIndex }) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';

            const label = document.createElement('span');
            const displayText = row.filter(c => c && c !== 'nan').join(' | ');
            label.textContent = displayText.substring(0, 120);
            div.appendChild(label);

            div.addEventListener('click', () => {
                scrollToRow('measurement-tbody', rowIndex);
                measurementSearchResults.classList.add('hidden');
                measurementSearch.value = '';
            });

            measurementSearchResults.appendChild(div);
        });

        measurementSearchResults.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#measurement-search') && !e.target.closest('#measurement-search-results')) {
            measurementSearchResults.classList.add('hidden');
        }
    });
    function startMultiLineMode(type) {
        // Hide the canvas-level redo button to avoid duplicate
        const resetBtn = document.getElementById('reset-length-btn');
        if (resetBtn) resetBtn.style.display = 'none';
        // ── RESTORE saved segments if this sub-cat already has measurements ──
        // ── RESTORE saved segments if this sub-cat already has measurements ──
        const existing = measurements[activeSubCatTab]?.[imageIndex];
        if (type === 'length') {
            multiLengths = existing?.lengthSegments?.length ? [...existing.lengthSegments] : (existing?.segments && existing.segmentType === 'length' ? [...existing.segments] : []);
        } else {
            multiBreadths = existing?.breadthSegments?.length ? [...existing.breadthSegments] : (existing?.segments && existing.segmentType === 'breadth' ? [...existing.segments] : []);
        }

        dimensionMode = type === 'length' ? 'LENGTH_ONLY' : 'BREADTH_ONLY';
        let clickPoints = [];
        const lines = type === 'length' ? multiLengths : multiBreadths;
        const color = type === 'length' ? '#e63900' : '#7b1fa2';
        const label = type === 'length' ? 'Length' : 'Breadth';

        function updateStatus() {
            const total = lines.reduce((s, l) => s + l.totalFeet, 0);
            const count = lines.length;
            const statusEl = document.getElementById('dimension-status');
            if (count === 0) {
                statusEl.textContent = `🔵 Click 2 points to mark ${label} 1`;
            } else {
                statusEl.textContent = `✅ ${label} ${count}: ${lines[count-1].totalFeet.toFixed(2)} ft — Click to add another or tap Done`;
            }
            statusEl.style.color = count > 0 ? '#2e7d32' : '#1565c0';
        }

        const lenCanvas = document.getElementById('corner-canvas');
        lenCanvas.style.display = '';
        lenCanvas.style.cursor = 'crosshair';
        lenCanvas.style.marginBottom = '80px';

        // Auto-save only — no manual save button needed
        const saveSegBtn = { style: { display: '' }, onclick: null, textContent: '', remove: () => {} };

        function saveCurrentSegments() {
            const total = lines.reduce((s, l) => s + l.totalFeet, 0);
            if (lines.length === 0) return;
            const prev = measurements[activeSubCatTab][imageIndex] || {};
            // Preserve the OTHER type's segments separately
            const lengthSegments = type === 'length' ? [...lines] : (prev.lengthSegments || []);
            const breadthSegments = type === 'breadth' ? [...lines] : (prev.breadthSegments || []);
            const lengthFt = type === 'length' ? total : (prev.lengthFt || 0);
            const breadthFt = type === 'breadth' ? total : (prev.breadthFt || 0);
            const areaSqFt = lengthFt > 0 && breadthFt > 0 ? lengthFt * breadthFt : total;
            measurements[activeSubCatTab][imageIndex] = {
                ...prev,
                lengthFt,
                breadthFt,
                heightFt: 0,
                areaSqFt,
                lengthInches: lengthFt * 12,
                breadthInches: breadthFt * 12,
                heightInches: 0,
                cornerPoints: [],
                lengthSegments,
                breadthSegments,
                // Keep legacy 'segments' pointing to current type for restore
                segments: [...lines],
                segmentType: type
            };
            rulerSetForCurrentImage = true;
            renderSubCatTabs();
        }

        saveSegBtn.onclick = () => {
            saveCurrentSegments();
            // Flash feedback
            saveSegBtn.textContent = '✅ Saved! Click canvas to add more';
            saveSegBtn.style.background = '#1565c0';
            setTimeout(() => {
                saveSegBtn.textContent = '💾 Save This Segment & Add More';
                saveSegBtn.style.background = '#2e7d32';
            }, 1500);
        };

        redraw = function() {
            const ctx = lenCanvas.getContext('2d');
            ctx.clearRect(0, 0, lenCanvas.width, lenCanvas.height);
            ctx.drawImage(currentPhoto, 0, 0, lenCanvas.width, lenCanvas.height);

            // Draw ruler
            if (rulerPoints.length === 2) {
                drawLine(ctx, rulerPoints[0], rulerPoints[1], '#00e5ff', '1ft Ruler ✓');
            }

            // Draw saved segments
            lines.forEach((seg, i) => {
                drawLine(ctx, seg.p1, seg.p2, color, `${label} ${i+1}: ${seg.totalFeet.toFixed(2)} ft`);
                [seg.p1, seg.p2].forEach(p => {
                    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI*2);
                    ctx.fillStyle = color; ctx.fill();
                });
            });

            // Draw current in-progress points
            clickPoints.forEach(p => {
                ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI*2);
                ctx.fillStyle = '#ff9800'; ctx.fill();
            });
            if (clickPoints.length === 2) {
                drawLine(ctx, clickPoints[0], clickPoints[1], '#ff9800', 'measuring...');
            }
        };

        lenCanvas.onclick = (e) => {
            const pos = getPos(lenCanvas, e);
            clickPoints.push(pos);
            if (clickPoints.length === 2) {
                const ft = pxToFtIn(pixelDist(clickPoints[0], clickPoints[1]), pixelsPerInch);
                lines.push({ p1: clickPoints[0], p2: clickPoints[1], totalFeet: ft.totalFeet, totalInches: ft.totalInches });
                clickPoints = [];
                updateStatus();
                redraw();
                saveCurrentSegments(); // auto-save after each segment
            } else {
                redraw();
            }
        };

        // ── DONE BUTTON ──
        const doneBar = document.getElementById('multi-line-done-bar');
        if (doneBar) doneBar.remove();
        const bar = document.createElement('div');
        bar.id = 'multi-line-done-bar';
        bar.style.cssText = `
            position:fixed;bottom:0;left:0;right:0;z-index:99999;
            display:flex;gap:8px;padding:10px 12px;
            background:white;border-top:2px solid #e0e0e0;
            box-shadow:0 -4px 16px rgba(0,0,0,0.12);
            align-items:center;
        `;
        // Add bottom padding to page so content doesn't hide behind bar
        document.getElementById('upload-image-page').style.paddingBottom = '80px';
        bar.innerHTML = `
            <button id="redo-all-multi-btn" style="
                flex:1;padding:8px 6px;border-radius:8px;
                background:#f0f0f0;color:#555;border:2px solid #ddd;
                font-size:0.78rem;font-weight:700;cursor:pointer;">↺ Redo All</button>
            <button id="redo-step-multi-btn" style="
                flex:1;padding:8px 6px;border-radius:8px;
                background:#fff3e0;color:#e65100;border:2px solid #ffcc80;
                font-size:0.78rem;font-weight:700;cursor:pointer;">↩ Undo Last</button>
            <button id="done-multi-btn" style="
                flex:2;padding:8px 12px;border-radius:8px;
                background:#e63900;color:white;border:none;
                font-size:0.82rem;font-weight:700;cursor:pointer;
                box-shadow:0 2px 8px rgba(230,57,0,0.3);">✅ Done — Show ${label} Results</button>
        `;
        document.body.appendChild(bar);

        bar.querySelector('#redo-step-multi-btn').onclick = () => {
            if (clickPoints.length > 0) {
                clickPoints = [];
                updateStatus();
                redraw();
            } else if (lines.length > 0) {
                lines.pop();
                if (type === 'length') multiLengths = [...lines];
                else multiBreadths = [...lines];
                saveCurrentSegments();
                updateStatus();
                redraw();
            }
        };

        bar.querySelector('#redo-all-multi-btn').onclick = () => {
            if (type === 'length') multiLengths = [];
            else multiBreadths = [];
            lines.length = 0;
            clickPoints = [];
            // Clear saved segments for this sub-cat/image
            if (measurements[activeSubCatTab]?.[imageIndex]) {
                delete measurements[activeSubCatTab][imageIndex];
            }
            renderSubCatTabs();
            updateStatus();
            redraw();
        };

        bar.querySelector('#done-multi-btn').onclick = () => {
            if (lines.length === 0) {
                alert('Please mark at least one ' + label + ' before continuing.');
                return;
            }
            bar.remove();
            lenCanvas.style.marginBottom = '0';
            document.getElementById('upload-image-page').style.paddingBottom = '0';
            buildMultiLineResult(type);
        };

        updateStatus();
        redraw();
    }

    function buildMultiLineResult(type) {
        const lines = type === 'length' ? multiLengths : multiBreadths;
        if (lines.length === 0) return;

        const total = lines.reduce((s, l) => s + l.totalFeet, 0);

        if (type === 'length') {
            measuredLength = { totalFeet: total, totalInches: total * 12, display: `${total.toFixed(2)} ft (${lines.length} segments)` };
            dimensionMode = 'LENGTH_ONLY';
        } else {
            measuredBreadth = { totalFeet: total, totalInches: total * 12, display: `${total.toFixed(2)} ft (${lines.length} segments)` };
            dimensionMode = 'BREADTH_ONLY';
        }
        measuredHeight = null;

        // ── Store measurements (variables defined FIRST) ──
        const prevData = measurements[activeSubCatTab][imageIndex] || {};
        const newLengthFt = type === 'length' ? total : (prevData.lengthFt || 0);
        const newBreadthFt = type === 'breadth' ? total : (prevData.breadthFt || 0);
        const newLengthSegments = type === 'length' ? lines.map(l => ({ ...l })) : (prevData.lengthSegments || []);
        const newBreadthSegments = type === 'breadth' ? lines.map(l => ({ ...l })) : (prevData.breadthSegments || []);
        const newAreaSqFt = newLengthFt > 0 && newBreadthFt > 0 ? newLengthFt * newBreadthFt : total;

        measurements[activeSubCatTab][imageIndex] = {
            ...prevData,
            lengthFt: newLengthFt,
            breadthFt: newBreadthFt,
            heightFt: 0,
            areaSqFt: newAreaSqFt,
            lengthInches: newLengthFt * 12,
            breadthInches: newBreadthFt * 12,
            heightInches: 0,
            cornerPoints: [],
            lengthSegments: newLengthSegments,
            breadthSegments: newBreadthSegments,
            segments: lines.map(l => ({ ...l })),
            segmentType: type
        };

        // ── Update result display (variables now defined above) ──
        document.getElementById('result-length').textContent = newLengthFt > 0 ? `${newLengthFt.toFixed(2)} ft` : 'NA';
        document.getElementById('result-breadth').textContent = newBreadthFt > 0 ? `${newBreadthFt.toFixed(2)} ft` : 'NA';
        document.getElementById('result-height').textContent = 'NA';
        document.getElementById('result-area').textContent = `${newAreaSqFt.toFixed(2)} sq.ft`;
        document.getElementById('result-length-row').style.opacity = newLengthFt > 0 ? '1' : '0.4';
        document.getElementById('result-breadth-row').style.opacity = newBreadthFt > 0 ? '1' : '0.4';
        document.getElementById('result-height-row').style.opacity = '0.4';

        measurementRect = {
            lengthFt: newLengthFt,
            breadthFt: newBreadthFt,
            heightFt: 0,
            areaSqFt: newAreaSqFt,
            lengthInches: newLengthFt * 12,
            breadthInches: newBreadthFt * 12,
            heightInches: 0,
        };

        rulerSetForCurrentImage = true;
        goToStep(3);
        renderSubCatTabs();
        renderResultsSummary();
    }
    function renderSubCatTabs() {
        // Remove existing tab bar if any
        let tabBar = document.getElementById('subcat-tab-bar');
        if (tabBar) tabBar.remove();

        tabBar = document.createElement('div');
        tabBar.id = 'subcat-tab-bar';
        tabBar.style.cssText = `
            display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 16px;
            background: #fff; border-bottom: 2px solid #f0f0f0;
            position: sticky; top: 0; z-index: 100;
        `;

        measurementQueue.forEach((item, idx) => {
            const parts = item.cellText.split('›').map(p => p.trim()).filter(Boolean);
            const junkPattern = /^(\d+(\.\d+)?|nos|sq\.?ft|rmt|rm|lm|kg|mtr|m|unit|units|no)$/i;
            const meaningfulParts = parts.filter(p => !junkPattern.test(p.trim()));
            const label = meaningfulParts[meaningfulParts.length - 1] || parts[parts.length - 1] || item.cellText;

            const tab = document.createElement('button');
            tab.dataset.tabIdx = idx;

            // Check if this sub-cat has any measurement for current image
            const isDone = measurements[idx] && measurements[idx][imageIndex] !== undefined;
            const isActive = idx === activeSubCatTab;

            tab.textContent = `${isDone ? '✅' : '⬜'} ${label}`;
            tab.style.cssText = `
                padding: 8px 16px; border-radius: 20px; border: 2px solid;
                font-size: 0.85rem; font-weight: 600; cursor: pointer;
                border-color: ${isActive ? '#e63900' : isDone ? '#2e7d32' : '#ddd'};
                background: ${isActive ? '#e63900' : isDone ? '#e8f5e9' : '#f9f9f9'};
                color: ${isActive ? 'white' : isDone ? '#2e7d32' : '#555'};
            `;

            tab.onclick = () => {
                if (!rulerSetForCurrentImage) {
                    alert('Please mark the ruler first before switching sub-categories.');
                    return;
                }
                activeSubCatTab = idx;
                renderSubCatTabs();
                updateUploadHeading(idx);

                // If already measured, go straight to results for this sub-cat
                const existing = measurements[idx] && measurements[idx][imageIndex];
                if (existing) {
                    measuredLength = existing.lengthFt > 0
                        ? { totalFeet: existing.lengthFt, totalInches: existing.lengthInches, display: `${existing.lengthFt.toFixed(2)} ft` }
                        : null;
                    measuredBreadth = existing.breadthFt > 0
                        ? { totalFeet: existing.breadthFt, totalInches: existing.breadthInches, display: `${existing.breadthFt.toFixed(2)} ft` }
                        : null;
                    measuredHeight = existing.heightFt > 0
                        ? { totalFeet: existing.heightFt, totalInches: existing.heightInches, display: `${existing.heightFt.toFixed(2)} ft` }
                        : null;
                    cornerPoints = existing.cornerPoints ? [...existing.cornerPoints] : [];

                    // Restore result display
                    document.getElementById('result-length').textContent = measuredLength ? measuredLength.display : 'NA';
                    document.getElementById('result-breadth').textContent = measuredBreadth ? measuredBreadth.display : 'NA';
                    document.getElementById('result-height').textContent = measuredHeight ? measuredHeight.display : 'NA';
                    if (existing.segments && existing.segments.length > 0) {
                        const segLabel = existing.segmentType === 'length' ? 'lengths' : 'breadths';
                        document.getElementById('result-area').textContent = 
                            `${existing.areaSqFt.toFixed(2)} ft (${existing.segments.length} ${segLabel})`;
                    } else {
                        document.getElementById('result-area').textContent = `${existing.areaSqFt.toFixed(2)} sq.ft`;
                    }
                    document.getElementById('result-length-row').style.opacity = measuredLength ? '1' : '0.4';
                    document.getElementById('result-breadth-row').style.opacity = measuredBreadth ? '1' : '0.4';
                    document.getElementById('result-height-row').style.opacity = measuredHeight ? '1' : '0.4';

                    goToStep(3);
                    renderResultsSummary();
                } else {
                    restoreStep2AndSetupCornersOnly();
                }
            };

            tabBar.appendChild(tab);
        });

        // Insert tab bar before step2-content
        const step2 = document.getElementById('step2-content');
        step2.parentElement.insertBefore(tabBar, step2);
    }

    function injectAddImageButtonToStep2() {
        // Remove existing if any
        const existing = document.getElementById('step2-add-image-btn');
        if (existing) existing.remove();

        const files = document.getElementById('photo-input').files;
        const nextImageIndex = imageIndex + 1;
        const hasNextFile = files && files[nextImageIndex];

        const btn = document.createElement('button');
        btn.id = 'step2-add-image-btn';
        btn.style.cssText = `
            width:100%;padding:10px;margin-bottom:12px;border-radius:10px;
            background:#1565c0;color:white;border:none;font-size:0.95rem;
            font-weight:600;cursor:pointer;display:block;
        `;
        btn.textContent = hasNextFile
            ? `📷 Done with this image — Measure Image ${nextImageIndex + 1} of ${files.length}`
            : '📷 Done with this image — Add Another Image';

        btn.onclick = () => handleAddImage();

        // Insert at top of step2-content, before instruction box
        const step2 = document.getElementById('step2-content');
        step2.insertBefore(btn, step2.firstChild);
    }
    function calculateAndShowForSubCat() {
        const topWidth = pixelDist(cornerPoints[0], cornerPoints[1]);
        const bottomWidth = pixelDist(cornerPoints[3], cornerPoints[2]);
        const avgWidth = (topWidth + bottomWidth) / 2;
        const leftHeight = pixelDist(cornerPoints[0], cornerPoints[3]);
        const rightHeight = pixelDist(cornerPoints[1], cornerPoints[2]);
        const avgHeight = (leftHeight + rightHeight) / 2;

        const newLength = pxToFtIn(avgWidth, pixelsPerInch);
        const newBreadth = pxToFtIn(avgHeight, pixelsPerInch);
        measuredHeight = null;
        dimensionMode = 'LB';

        // Add to any previously saved length segments (e.g. Length Only was done before)
        const prev = measurements[activeSubCatTab]?.[imageIndex] || {};
        const prevLengthFt = prev.lengthFt || 0;
        

        // New LB corners: add new length on top of any prior length-only segments
        // Breadth: take max (not sum) since breadth is typically a single dimension
        const totalLengthFt = prevLengthFt + newLength.totalFeet;
        const prevBreadthFt = prev.breadthFt || 0;
        const totalBreadthFt = prevBreadthFt + newBreadth.totalFeet; // breadth from corners replaces/sets breadth
        const areaSqFt = totalLengthFt * totalBreadthFt;

        measuredLength = { totalFeet: totalLengthFt, totalInches: totalLengthFt * 12, display: `${totalLengthFt.toFixed(2)} ft` };
        measuredBreadth = { totalFeet: totalBreadthFt, totalInches: totalBreadthFt * 12, display: `${totalBreadthFt.toFixed(2)} ft` };

        document.getElementById('dimension-status').textContent =
            `✅ L: ${measuredLength.display}${prevLengthFt > 0 ? ` (prev ${prevLengthFt.toFixed(2)} + new ${newLength.totalFeet.toFixed(2)})` : ''} | B: ${measuredBreadth.display} | Area: ${areaSqFt.toFixed(2)} sq.ft`;
        document.getElementById('dimension-status').style.color = '#2e7d32';

        // Preserve existing length segments, add new LB corner segment
        const lengthSegments = [...(prev.lengthSegments || []), {
            p1: cornerPoints[0], p2: cornerPoints[1],
            totalFeet: newLength.totalFeet, totalInches: newLength.totalInches,
            fromLB: true
        }];

        measurements[activeSubCatTab][imageIndex] = {
            ...prev,
            lengthFt: totalLengthFt,
            breadthFt: totalBreadthFt,
            heightFt: 0,
            areaSqFt,
            lengthInches: totalLengthFt * 12,
            breadthInches: totalBreadthFt * 12,
            heightInches: 0,
            cornerPoints: [...cornerPoints],
            lengthSegments,
            breadthSegments: [{ p1: cornerPoints[0], p2: cornerPoints[3], totalFeet: totalBreadthFt, totalInches: totalBreadthFt * 12, fromLB: true }],
            segments: [],
            segmentType: 'LB'
        };
        rulerSetForCurrentImage = true;
        renderSubCatTabs();

        document.getElementById('result-length').textContent = measuredLength.display;
        document.getElementById('result-breadth').textContent = measuredBreadth.display;
        document.getElementById('result-height').textContent = 'NA';
        document.getElementById('result-area').textContent = `${areaSqFt.toFixed(2)} sq.ft`;
        document.getElementById('result-length-row').style.opacity = '1';
        document.getElementById('result-breadth-row').style.opacity = '1';
        document.getElementById('result-height-row').style.opacity = '0.4';

        setTimeout(() => {
            goToStep(3);
            renderResultsSummary();
        }, 600);
    }
    function renderResultsSummary() {
        const assignBox = document.getElementById('queue-assign-box');
        const assignList = document.getElementById('queue-assign-list');
        assignBox.style.display = 'block';
        assignList.innerHTML = '';

const files = document.getElementById('photo-input').files;
const nextImageIndex = imageIndex + 1;
const hasNextFile = files && files[nextImageIndex];


        // ── SUB-CAT SECTIONS ──
        measurementQueue.forEach((item, subIdx) => {
            const parts = item.cellText.split('›').map(p => p.trim()).filter(Boolean);
            const junkPattern = /^(\d+(\.\d+)?|nos|sq\.?ft|rmt|rm|lm|kg|mtr|m|unit|units|no)$/i;
            const meaningfulParts = parts.filter(p => !junkPattern.test(p.trim()));
            const label = meaningfulParts[meaningfulParts.length - 1] || parts[parts.length - 1] || item.cellText;
            const particular = meaningfulParts.slice(0, -1).join(' › ');
            const imgMeasurements = measurements[subIdx] || {};
            const imageKeys = Object.keys(imgMeasurements);

            const section = document.createElement('div');
            section.style.cssText = 'border:1px solid #e0e0e0;border-radius:10px;padding:12px;margin-bottom:12px;cursor:pointer;';

            const header = document.createElement('div');
    header.style.cssText = 'font-weight:700;font-size:0.95rem;margin-bottom:8px;color:#1a1a1a;display:flex;justify-content:space-between;align-items:center;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'width:20px;height:20px;accent-color:#e63900;cursor:pointer;margin-right:10px;flex-shrink:0;';

    // Check if this sub-item already has measurement for current image
    cb.checked = measurements[subIdx] && measurements[subIdx][imageIndex] !== undefined;

    cb.addEventListener('change', () => {
        if (cb.checked) {
            // Copy current active measurement to this sub-item
            const activeMeasurement = measurements[activeSubCatTab]?.[imageIndex];
            if (activeMeasurement) {
                if (!measurements[subIdx]) measurements[subIdx] = {};
                measurements[subIdx][imageIndex] = { ...activeMeasurement };
            }
        } else {
            // Remove measurement for this sub-item
            if (measurements[subIdx] && measurements[subIdx][imageIndex]) {
                delete measurements[subIdx][imageIndex];
            }
        }
        renderSubCatTabs();
        renderResultsSummary();
    });

    header.innerHTML = `
        <span style="font-size:0.95rem;font-weight:700;color:#1a1a1a;">
            ${label}
            ${particular ? `<br><small style="color:#888;font-weight:400;font-size:0.8rem;">📁 ${particular}</small>` : ''}
        </span>
    `;
    header.insertBefore(cb, header.firstChild);

            // Click section to switch to that sub-cat

            section.appendChild(header);

            if (imageKeys.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#bbb;font-size:0.85rem;padding:4px 0;';
                empty.textContent = '⬜ Not yet measured';
                section.appendChild(empty);
            } else {
                let totalArea = 0;
                let totalLengthSum = 0, totalBreadthSum = 0;
                imageKeys.forEach((imgIdx) => {
                    const m = imgMeasurements[imgIdx];
                    totalArea += m.areaSqFt;
                    totalLengthSum += m.lengthFt;
                    totalBreadthSum += m.breadthFt;
                    const row = document.createElement('div');
                    row.style.cssText = 'font-size:0.85rem;color:#444;padding:3px 0;border-bottom:1px solid #f5f5f5;';
                    row.textContent = `📷 Image ${parseInt(imgIdx) + 1}: L=${m.lengthFt.toFixed(2)}ft  B=${m.breadthFt.toFixed(2)}ft  Area=${m.areaSqFt.toFixed(2)} sq.ft`;
                    section.appendChild(row);
                });
                if (imageKeys.length > 1) {
                    const combinedArea = totalLengthSum > 0 && totalBreadthSum > 0
                        ? totalLengthSum * totalBreadthSum
                        : totalArea;
                    const total = document.createElement('div');
                    total.style.cssText = 'font-weight:700;color:#e63900;font-size:0.9rem;padding-top:6px;';
                    total.textContent = `📐 Total Area: ${combinedArea.toFixed(2)} sq.ft (L:${totalLengthSum.toFixed(2)} × B:${totalBreadthSum.toFixed(2)})`;
                    section.appendChild(total);
                }

                // ── ADD MORE BUTTON ──
                const addMoreBtn = document.createElement('button');
                addMoreBtn.style.cssText = `
                    width:100%;margin-top:8px;padding:8px;border-radius:8px;
                    background:#fff3e0;color:#e65100;border:1px solid #ffcc80;
                    font-size:0.85rem;font-weight:600;cursor:pointer;
                `;
                addMoreBtn.textContent = '➕ Add More Measurements to This Sub-Item';
                addMoreBtn.onclick = (e) => {
                    e.stopPropagation(); // don't trigger section.onclick
                    activeSubCatTab = subIdx;
                    renderSubCatTabs();
                    updateUploadHeading(subIdx);

                    const existingData = measurements[subIdx]?.[imageIndex];
                    // Restore multiline arrays from saved segments if any
                    multiLengths = existingData?.lengthSegments?.length ? [...existingData.lengthSegments] : (existingData?.segments && existingData.segmentType === 'length' ? [...existingData.segments] : []);
                    multiBreadths = existingData?.breadthSegments?.length ? [...existingData.breadthSegments] : (existingData?.segments && existingData.segmentType === 'breadth' ? [...existingData.segments] : []);

                    // Go to step 2 and skip ruler (already set)
                    document.getElementById('step2-content').innerHTML = originalStep2HTML;
                    document.getElementById('step2-content').classList.remove('hidden');
                    goToStep(2);

                    // Setup canvas — ruler already done so go corners-only path
                    // but show dimension choice modal so user picks L/B/LB mode again
                    setupLengthCanvasCornersOnly();
                    injectAddImageButtonToStep2();
                };
                section.appendChild(addMoreBtn);
            }

            assignList.appendChild(section);
        });

        // ── BOTTOM ADD IMAGE BUTTON ──
        const existingBtn = document.getElementById('add-image-btn');
        if (existingBtn) existingBtn.remove();
        const addImgBtn = document.createElement('button');
        addImgBtn.id = 'add-image-btn';
        addImgBtn.style.cssText = `
            width:100%;padding:12px;margin-top:4px;border-radius:10px;
            background:#1565c0;color:white;border:none;font-size:1rem;
            font-weight:600;cursor:pointer;
        `;
        addImgBtn.textContent = hasNextFile
            ? `📷 Measure Image ${nextImageIndex + 1} of ${files.length}`
            : '📷 Add Another Image';
        addImgBtn.onclick = () => handleAddImage();
        assignList.after(addImgBtn);

        document.getElementById('result-item-name').textContent =
            `${measurementQueue.length} sub-item${measurementQueue.length > 1 ? 's' : ''} | Image ${imageIndex + 1}`;
    }
    function handleAddImage() {
        // Don't go to step 1 — stay on step 3 and show stacked image upload inline
        const assignList = document.getElementById('queue-assign-list');

        // Remove any existing inline upload box
        const existing = document.getElementById('inline-image-upload');
        if (existing) existing.remove();

        const box = document.createElement('div');
        box.id = 'inline-image-upload';
        box.style.cssText = `
            border:2px dashed #1565c0;border-radius:12px;padding:20px;
            margin-top:12px;text-align:center;background:#f0f7ff;
        `;
        box.innerHTML = `
            <div style="font-size:1.1rem;font-weight:700;color:#1565c0;margin-bottom:8px;">
                📷 Image ${imageIndex + 2}
            </div>
            <div style="color:#555;font-size:0.9rem;margin-bottom:14px;">
                Upload next image to continue measuring
            </div>
            <button id="inline-pick-btn" style="
                padding:12px 24px;border-radius:10px;background:#1565c0;
                color:white;border:none;font-size:0.95rem;font-weight:600;cursor:pointer;">
                📁 Choose Image
            </button>
            <div id="inline-upload-preview" style="margin-top:10px;font-size:0.85rem;color:#888;"></div>
        `;
        assignList.appendChild(box);

        // Scroll to it
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });

        box.querySelector('#inline-pick-btn').onclick = () => {
            const tempInput = document.createElement('input');
            tempInput.type = 'file';
            tempInput.accept = 'image/*';
            tempInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                box.querySelector('#inline-upload-preview').textContent = `📷 ${file.name} selected — opening...`;
                // Increment imageIndex and load image
                imageIndex++;
                rulerSetForCurrentImage = false;
                pixelsPerInch = 0;
                activeSubCatTab = 0;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    currentPhoto = new Image();
                    currentPhoto.onload = () => {
                        // Remove inline box before going to step 2
                        box.remove();
                        goToStep(2);
                        renderSubCatTabs();
                        showRotationStep();
                        setTimeout(() => injectAddImageButtonToStep2(), 50);
                    };
                    currentPhoto.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            };
            tempInput.click();
        };
    }
