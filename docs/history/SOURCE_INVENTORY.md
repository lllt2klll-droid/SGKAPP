> **Baseline lịch sử** — số liệu của giai đoạn đó, KHÔNG phản ánh hiện trạng.
> Kiểm tra mới: docs/ARCHITECTURE.md (kiến trúc) và docs/TECHNICAL_DEBT.md (nợ). Chuyển vào docs/history/ ngày 2026-09-30.


# SOURCE INVENTORY - SGK APP

## PHASE 1: FULL SOURCE INVENTORY

### ROOT CONFIGURATION
| File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|------|---------------|--------------|------------|-------------|---------|--------------|
| package.json | Project config, dependencies | Node.js, npm | Build config | Dependencies | None | Build configuration |
| vite.config.js | Build configuration | Vite plugins | Build config | Optimized bundle | None | Build process |
| server.js | Express backend, file serving | Express, multer, cors | File uploads | PDF files | File system | File operations |

### CORE APPLICATION LAYER
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| App Shell | App.jsx | Main application shell, routing, global state | All views, storage, settings | User actions | UI rendering | localStorage, IndexedDB | Navigation, events |
| App Shell | main.jsx | React entry point | React, ReactDOM | None | App rendering | None | React mounting |
| Components | AppShell.jsx | Application shell layout | Navigation, styles | Global state | Layout | None | UI rendering |
| Components | Navigation.jsx | Navigation menu | navigationConfig, App | Route changes | Menu state | localStorage | Navigation |
| Components | AppHeader.jsx | Application header | Lucide icons | Global state | Header UI | None | UI rendering |

### BOOK READER MODULE
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| Core | BookReader.jsx | PDF rendering, zoom/pan, selection | PDF.js, scan system, AI, storage | Book, user actions | PDF display, selection | localStorage, IndexedDB | PDF rendering, OCR |
| Reader | pdfRenderer.js | PDF rendering utilities | PDF.js | PDF document | Canvas | None | PDF processing |
| Reader | pageNavigation.js | Page navigation logic | None | Current page, direction | New page | localStorage | State updates |
| Reader | zoomController.js | Zoom control logic | None | Zoom level, direction | New zoom | localStorage | State updates |

### SCAN / CROP MODULE (P0)
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| Core | ScanModal.jsx | Scan UI and orchestration | scanCoordinates, scanCapture, AI | Selection | Scan history | IndexedDB | AI calls |
| Core | ScanOverlay.jsx | Selection overlay | React, coordinates | User drag | Selection rectangle | None | UI updates |
| Core | ScanHistory.jsx | Scan history display | scanStore | Scan data | History UI | IndexedDB | None |
| Core | CropPreview.jsx | Crop preview | scanCapture | Crop result | Preview UI | None | None |
| Utilities | scanCoordinates.js | Coordinate transformation | None | Selection, rects | Canvas pixels | None | Math calculations |
| Utilities | scanCapture.js | Canvas cropping | scanCoordinates | Canvas, selection | Image blob | None | Canvas operations |
| Utilities | scanStore.js | Scan data persistence | storage.js | Scan data | Storage | IndexedDB | Storage operations |
| AI | scanAIService.js | AI for scan analysis | aiService | Image blob | Material | None | AI API calls |
| Materials | materialGenerator.js | Material generation from AI | AI response | Material data | teachingDB | None | Data transformation |
| UI | SourceBadge.jsx | Source attribution badge | sourceBadgeUtils | Scan data | Badge UI | None | UI rendering |

### AI MODULE
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| Core | aiService.js | Unified AI service layer | API config | Prompts, content | AI response | None | API calls |
| Storage | aiDataStorage.js | AI data caching | storage.js | AI responses | Cached data | IndexedDB | Storage operations |
| KHBD | khbdAIEngine.js | KHBD-specific AI integration | aiService, storage | Lesson plans | AI suggestions | None | AI API calls |
| Image | imageAnalysisService.js | Image analysis | aiService | Images | Analysis | None | AI API calls |

### KHBD MODULE
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| Domain | khbdDomain.js | Canonical KHBD schemas | storage, objective engine | Legacy data | Normalized data | None | Schema migration |
| Objective | khbdObjectiveEngine.js | Objective ID and mapping | storage | Lesson plans | Objectives with IDs | None | ID generation |
| Activity | khbdActivityEngine.js | Activity management | storage, domain | Activities | CRUD operations | teachingDB | Storage operations |
| Activity | khbdActivityBankEngine.js | Activity library | storage | Library | CRUD operations | teachingDB | Storage operations |
| Assessment | khbdAssessmentEngine.js | Assessment handling | storage | Activities | Assessment data | None | Calculation |
| Autosave | khbdAutosaveEngine.js | Autosave functionality | storage | Lesson plans | Saved plans | teachingDB | Storage operations |
| Integration | khbdBookIntegrationEngine.js | Book integration | storage | Books | Book references | None | Reference creation |
| Differentiation | khbdDifferentiationEngine.js | Differentiation support | storage | Activities | Differentiation | None | Data transformation |
| Export | khbdExportRegressionEngine.js | Export validation | storage | Lesson plans | Export data | None | Validation |
| Performance | khbdPerformanceEngine.js | Performance tracking | storage | Activities | Performance data | None | Calculation |
| Preview | khbdPreviewEngine.js | Preview generation | storage | Lesson plans | Preview data | None | Data transformation |
| Product | khbdProductEngine.js | Product generation | storage | Activities | Products | None | Data transformation |
| Question | khbdQuestionBankEngine.js | Question bank integration | storage | Questions | Activities | None | Data transformation |
| Repository | khbdRepository.js | KHBD repository layer | storage | Lesson plans | CRUD operations | teachingDB | Storage operations |
| Section | khbdSectionEngine.js | Section management | storage | Activities | Section data | None | Data transformation |
| Step | khbdStepEngine.js | Step management | storage | Activities | Step data | None | Data transformation |
| Time | khbdTimeEngine.js | Time calculation | storage | Activities | Time data | None | Calculation |
| Validation | khbdValidationEngine.js | Validation logic | storage | Lesson plans | Validation results | None | Validation |
| Version | khbdVersionEngine.js | Version control | storage | Lesson plans | Version data | teachingDB | Storage operations |
| Test | khbdTestMatrix.js | Test matrix utilities | storage | Test data | Test results | None | Test operations |

### SGK-KHBD INTEGRATION
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| Core | SgkKhbdPanel.jsx | SGK→KHBD UI panel | Integration service, AI | SGK selection | KHBD data | teachingDB | AI calls |
| Reference | bookReference.js | Book reference creation | None | Book data | Reference objects | None | Data transformation |
| Normalizer | contentNormalizer.js | Content normalization | None | Raw content | Normalized data | None | Data transformation |
| Service | integrationService.js | SGK→KHBD bridge | Domain, teachingDB | SGK content | Lesson plans | teachingDB | Storage operations |

### STORAGE LAYER
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| Core | storage.js | localStorage helpers | indexedDB.js | Data | Storage | localStorage | Storage operations |
| IndexedDB | indexedDB.js | IndexedDB wrapper | None | Data | IndexedDB | IndexedDB | Database operations |
| Teaching | teachingDB.js | Teaching data repository | storage, KHBD domain | Lesson plans, questions | CRUD operations | localStorage | Storage operations |
| Research | researchDB.js | Research data repository | storage, indexedDB | Clips, refs | CRUD operations | localStorage, IndexedDB | Storage operations |
| Personal | personalDB.js | Personal data repository | storage | Tasks, ideas | CRUD operations | localStorage | Storage operations |
| User Data | userdata.js | User data repository | storage | Bookmarks, vocab | CRUD operations | localStorage | Storage operations |
| Settings | settingsStore.js | Settings management | storage | Settings | CRUD operations | localStorage | Storage operations |
| Missions | missionStore.js | Mission tracking | storage | Mission data | CRUD operations | localStorage | Storage operations |
| Events | missionEvents.js | Mission event system | None | User actions | Events | None | Event emission |
| Registry | missionRegistry.js | Mission definitions | None | Mission config | Mission data | None | Configuration |
| Sync | syncService.js | Sync service | storage | Sync data | Sync status | None | API calls |

### QUESTION BANK / ACTIVITIES
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| UI | QuestionBankView.jsx | Question bank UI | teachingDB, export | User actions | CRUD operations | teachingDB | Storage operations |
| UI | ActivitiesView.jsx | Activities UI | teachingDB | User actions | CRUD operations | teachingDB | Storage operations |
| UI | WorksheetsView.jsx | Worksheets UI | teachingDB | User actions | CRUD operations | teachingDB | Storage operations |

### DATA TOOLS
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| UI | DataToolsView.jsx | Data tools UI | storage | User actions | CRUD operations | storage | Storage operations |
| UI | SearchView.jsx | Search UI | searchIndex, indexedDB | Search queries | Results | IndexedDB | Search operations |
| Search | searchIndex.js | Search indexing | indexedDB | Book content | Search index | IndexedDB | Index operations |
| Content | GlobalSearch.jsx | Global search | searchIndex | Search queries | Results | IndexedDB | Search operations |
| Content | CompareView.jsx | Content comparison | researchDB | User selection | Comparison | researchDB | None |
| Content | MatrixView.jsx | Content matrix | researchDB | User selection | Matrix | researchDB | None |
| Content | ReferencesView.jsx | References UI | researchDB | User actions | CRUD operations | researchDB | Storage operations |
| Content | ConceptsView.jsx | Concepts UI | researchDB | User actions | CRUD operations | researchDB | Storage operations |
| Content | CollectionsView.jsx | Collections UI | researchDB | User actions | CRUD operations | researchDB | Storage operations |

### UTILITIES
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| Data | subjectCatalog.js | Subject catalog | storage | Book data | Subject info | localStorage | Data transformation |
| Data | tocData.js | Table of contents data | None | Hardcoded | TOC data | None | None |
| Data | tocExcel.js | Excel export for TOC | xlsx | TOC data | Excel file | None | File generation |
| Data | textutils.js | Text utilities | None | Text | Processed text | None | String operations |
| Data | bookUtils.js | Book utilities | None | Book data | Processed data | None | Data transformation |
| Data | dataIntegrity.js | Data integrity checks | storage | All data | Integrity status | None | Validation |
| Data | relatedData.js | Related data utilities | None | Data | Related data | None | Data transformation |
| UI | DataTable.jsx | Data table component | React | Data | Table UI | None | UI rendering |
| UI | RichText.jsx | Rich text editor | React | Text | Rich text | None | UI updates |
| UI | MarkdownText.jsx | Markdown renderer | React | Markdown | HTML | None | Text transformation |
| UI | CanvasWhiteboard.jsx | Canvas whiteboard | React | Drawing | Canvas | None | Canvas operations |
| UI | StructuredNotes.jsx | Structured notes | React | Notes | Notes UI | storage | Storage operations |

### MISSIONS / GAMIFICATION
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| UI | MissionsView.jsx | Missions UI | missionStore, registry | User actions | Mission progress | localStorage | Storage operations |
| UI | MissionWidget.jsx | Mission widget | missionStore | Mission events | Mission progress | localStorage | Event handling |
| Styles | missions.css | Missions styling | None | None | CSS | None | UI rendering |

### SETTINGS / CONFIG
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| UI | SettingsCenter.jsx | Settings UI | settingsStore | User actions | Settings | localStorage | Storage operations |
| Config | designTokens.js | Design tokens | None | None | CSS variables | None | CSS generation |
| Config | pdfjs-config.js | PDF.js configuration | PDF.js | None | PDF config | None | PDF initialization |

### SYNC / BACKUP
| Module | File | Responsibility | Dependencies | Data Input | Data Output | Storage | Side Effects |
|--------|------|---------------|--------------|------------|-------------|---------|--------------|
| UI | SyncPanel.jsx | Sync UI | syncService | User actions | Sync status | None | API calls |
| Service | syncService.js | Sync service | storage | Sync data | Sync status | None | API calls |

### TEST FILES
| Module | File | Responsibility | Dependencies | Test Data | Test Output | Coverage |
|--------|------|---------------|--------------|-----------|------------|----------|
| API | apiConfig.test.js | API config tests | apiConfig | Config config | Test results | API configuration |
| AI | khbdAIEngine.test.js | AI engine tests | khbdAIEngine | Mock data | Test results | AI functionality |
| Search | searchIndex.test.js | Search tests | searchIndex | Test strings | Test results | Search normalization |
| KHBD | sgkKhbd.test.js | KHBD integration tests | KHBD modules | Mock data | Test results | KHBD integration |
| E2E | sgk-khbd.spec.js | E2E tests | Playwright | App actions | Test results | End-to-end flows |
| Comprehensive | khbd.comprehensive.test.js | Comprehensive tests | KHBD modules | Mock data | Test results | Full KHBD |

### STYLES
| Module | File | Responsibility | Size | Dependencies |
|--------|------|---------------|------|--------------|
| Main | styles.css | Main stylesheet | 392KB | None |
| Dashboard | dashboard-compact.css | Dashboard styles | 14KB | styles.css |

### DATA FILES
| Module | File | Responsibility | Size | Dependencies |
|--------|------|---------------|------|--------------|
| Data | ktspLogo.js | KTSP logo data | 275KB | None |
| Data | sampleData.js | Sample data for testing | 24KB | None |
| Data | tocData.js | Table of contents data | 132KB | None |

## MODULE COUNT SUMMARY
- **Total JS Files**: 68
- **Total JSX Files**: 35
- **Total CSS Files**: 2
- **Total Test Files**: 5
- **Total KHBD Engine Files**: 16
- **Total Scan Files**: 8
- **Total Storage Files**: 5
- **Total Mission Files**: 3
- **Total Utility Files**: 9

## DEPENDENCY SUMMARY
- **External Libraries**: React, PDF.js, Lucide React, Express, CORS, Multer, XLSX
- **Internal Modules**: 8 main modules with 68 files
- **Storage Systems**: localStorage + IndexedDB hybrid
- **AI Integration**: Gemini API via unified service layer
- **Build System**: Vite + Rollup