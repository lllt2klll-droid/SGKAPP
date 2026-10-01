// ── Image Analysis Service ───────────────────────────────────────────────
// Service for analyzing images and extracting data for manual input automation
// Supports analysis of textbooks, handwritten notes, lesson plans, etc.

import aiService from './aiService.js';
import { getGeminiApiKey } from './storage.js';
import aiDataStorage from './aiDataStorage.js';

/**
 * Convert image to base64 for API processing
 * @param {File} imageFile - Image file to convert
 * @returns {Promise<string>} Base64 encoded image
 */
async function imageToBase64(imageFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // Remove data URL prefix if present
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(imageFile);
  });
}

/**
 * Analyze image and extract question bank data
 * @param {File} imageFile - Image file containing questions
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Extracted question data
 */
async function analyzeImageForQuestions(imageFile, options = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chưa có API Key! Hãy cấu hình trong Cài đặt AI.');
  }

  const base64Image = await imageToBase64(imageFile);
  
  const systemInstruction = `Bạn là chuyên gia phân tích tài liệu giáo dục. Nhiệm vụ của bạn là trích xuất câu hỏi từ ảnh và chuyển đổi thành JSON format.

QUY TẮC:
1. Nhận dạng cả câu hỏi trắc nghiệm (mc), điền khuyết (fill) và tự luận (essay)
2. Trích xuất đầy đủ các đáp án A, B, C, D cho trắc nghiệm (đúng 4, không rỗng, correctIndex 0-3)
3. Xác định đáp án đúng (0-3, không dùng E/F/G)
4. Điền khuyết: type="fill", question + answer (dòng đáp án)
5. Tự luận: type="essay", question + answerGuide (vùng trả lời)
6. Phân loại mức độ khó: Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao
7. Giữ nguyên nội dung tiếng Việt, không thay đổi văn phong
8. Nếu không tìm thấy thông tin, để trống hoặc null

OUTPUT FORMAT (JSON):
{
  "questions": [
    {
      "type": "mc" | "fill" | "essay",
      "question": "Nội dung câu hỏi",
      "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
      "correctIndex": 0-3,
      "answer": "Đáp án cho điền khuyết / tự luận",
      "subject": "Tên môn học",
      "grade": "Lớp",
      "chapter": "Chương",
      "yccd": "Yêu cầu cần đạt",
      "mucdo": "Nhận biết | Thông hiểu | Vận dụng | Vận dụng cao"
    }
  ],
  "confidence": 0.0-1.0,
  "notes": "Ghi chú về kết quả phân tích"
}`;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: imageFile.type,
            data: base64Image
          }
        },
        {
          text: 'Phân tích ảnh này và trích xuất các câu hỏi. Trả về JSON format như mô tả.'
        }
      ]
    }
  ];

  try {
    const response = await aiService.callAI({
      apiKey,
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    });

    // Robust JSON extraction (strip fence, handle trailing commas)
    let _cQ = response.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
    const _sQ = _cQ.indexOf("{"), _eQ = _cQ.lastIndexOf("}");
    const jsonMatch = _sQ>=0 && _eQ>_sQ ? [_cQ.slice(_sQ,_eQ+1)] : null;
    if (!jsonMatch) {
      throw new Error('Không thể trích xuất JSON từ phản hồi AI');
    }
    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch { const fixed=jsonMatch[0].replace(/,\s*([}\]])/g,"$1"); parsed=JSON.parse(fixed); }
    
    // Validate and normalize data — PHASE 5: use canonical normalizer, reject invalid
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Dữ liệu câu hỏi không hợp lệ');
    }
    // Normalize via canonical schema (import lazy to avoid circular)
    try {
      const { normalizeGeneratedQuestion } = await import('./questionSchema.js');
      const before = parsed.questions.length;
      parsed.questions = parsed.questions.map(q=> normalizeGeneratedQuestion(q)).filter(Boolean);
      if (parsed.questions.length === 0 && before > 0) throw new Error('Tất cả câu hỏi AI đều không hợp lệ sau chuẩn hóa');
    } catch (e) { if (e.message && e.message.includes('không hợp lệ')) throw e; throw e; }
    const resultId = `questions_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    aiDataStorage.addAnalysisHistoryEntry({
      type: 'questions',
      success: true,
      resultId,
      confidence: parsed.confidence || 0.8,
      itemCount: parsed.questions.length,
      imageSize: imageFile.size
    });
    
    aiDataStorage.storeAnalysisResult(resultId, {
      type: 'questions',
      data: parsed.questions,
      confidence: parsed.confidence || 0.8,
      notes: parsed.notes || '',
      rawResponse: response
    });

    return {
      success: true,
      data: parsed.questions,
      confidence: parsed.confidence || 0.8,
      notes: parsed.notes || '',
      rawResponse: response
    };

  } catch (error) {
    console.error('Error analyzing image for questions:', error);
    
    // Record failed analysis
    aiDataStorage.addAnalysisHistoryEntry({
      type: 'questions',
      success: false,
      error: error.message,
      imageSize: imageFile.size
    });
    
    throw error;
  }
}

/**
 * Analyze image and extract lesson plan data
 * @param {File} imageFile - Image file containing lesson plan
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Extracted lesson plan data
 */
async function analyzeImageForLessonPlan(imageFile, options = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chưa có API Key! Hãy cấu hình trong Cài đặt AI.');
  }

  const base64Image = await imageToBase64(imageFile);
  
  const systemInstruction = `Bạn là chuyên gia phân tích giáo án giáo dục. Nhiệm vụ của bạn là trích xuất nội dung giáo án từ ảnh và chuyển đổi thành JSON format.

QUY TẮC:
1. Nhận dạng các phần chính của giáo án: Mục tiêu, Chuẩn bị, Hoạt động dạy học, Đánh giá
2. Trích xuất các hoạt động theo từng giai đoạn: Khởi động, Hình thành kiến thức mới, Luyện tập, Vận dụng, Củng cố
3. Giữ nguyên nội dung tiếng Việt, không thay đổi văn phong giáo án
4. Tách rõ các bước tiến hành của từng hoạt động
5. Nhận dạng thời gian phân bổ cho từng phần

OUTPUT FORMAT (JSON):
{
  "lessonPlan": {
    "title": "Tên bài dạy",
    "subject": "Môn học",
    "grade": "Lớp",
    "time": "Thời gian (phút)",
    "objectives": ["Mục tiêu 1", "Mục tiêu 2"],
    "preparation": {
      "teacher": ["Chuẩn bị của GV"],
      "student": ["Chuẩn bị của HS"]
    },
    "activities": [
      {
        "phase": "khoiDong|hinhThanhKienThucMoi|luyenTap|vanDung|cuongCo",
        "name": "Tên hoạt động",
        "content": "Nội dung triển khai",
        "time": "Thời gian (phút)",
        "steps": [
          {
            "teacherAction": "Hoạt động của GV",
            "studentAction": "Hoạt động của HS",
            "product": "Sản phẩm"
          }
        ]
      }
    ],
    "assessment": ["Phương pháp đánh giá"]
  },
  "confidence": 0.0-1.0,
  "notes": "Ghi chú về kết quả phân tích"
}`;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: imageFile.type,
            data: base64Image
          }
        },
        {
          text: 'Phân tích ảnh giáo án này và trích xuất nội dung. Trả về JSON format như mô tả.'
        }
      ]
    }
  ];

  try {
    const response = await aiService.callAI({
      apiKey,
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    });

    // Robust JSON extraction: strip fences, handle trailing commas
    let _clean = response.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
    const objS = _clean.indexOf("{"), objE = _clean.lastIndexOf("}");
    const jsonMatch = objS>=0 && objE>objS ? [_clean.slice(objS,objE+1)] : null;
    if (!jsonMatch) {
      throw new Error('Không thể trích xuất JSON từ phản hồi AI');
    }
    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch { const fixed=jsonMatch[0].replace(/,\s*([}\]])/g,"$1"); parsed=JSON.parse(fixed); }
    
    if (!parsed.lessonPlan) {
      throw new Error('Dữ liệu giáo án không hợp lệ');
    }

    // Record successful analysis
    const resultId = `lessonPlan_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    aiDataStorage.addAnalysisHistoryEntry({
      type: 'lessonPlan',
      success: true,
      resultId,
      confidence: parsed.confidence || 0.8,
      imageSize: imageFile.size
    });
    
    aiDataStorage.storeAnalysisResult(resultId, {
      type: 'lessonPlan',
      data: parsed.lessonPlan,
      confidence: parsed.confidence || 0.8,
      notes: parsed.notes || '',
      rawResponse: response
    });

    return {
      success: true,
      data: parsed.lessonPlan,
      confidence: parsed.confidence || 0.8,
      notes: parsed.notes || '',
      rawResponse: response
    };

  } catch (error) {
    console.error('Error analyzing image for lesson plan:', error);
    
    // Record failed analysis
    aiDataStorage.addAnalysisHistoryEntry({
      type: 'lessonPlan',
      success: false,
      error: error.message,
      imageSize: imageFile.size
    });
    
    throw error;
  }
}

/**
 * Analyze image and extract activity data
 * @param {File} imageFile - Image file containing activity
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Extracted activity data
 */
async function analyzeImageForActivity(imageFile, options = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chưa có API Key! Hãy cấu hình trong Cài đặt AI.');
  }

  const base64Image = await imageToBase64(imageFile);
  
  const systemInstruction = `Bạn là chuyên gia phân tích hoạt động dạy học. Nhiệm vụ của bạn là trích xuất hoạt động từ ảnh và chuyển đổi thành JSON format.

QUY TẮC:
1. Nhận dạng loại hoạt động: Khởi động, Trò chơi, Thảo luận, Thực hành, etc.
2. Trích xuất nội dung triển khai chi tiết
3. Xác định giai đoạn phù hợp: khoiDong, hinhThanhKienThucMoi, luyenTap, vanDung, cuongCo
4. Giữ nguyên nội dung tiếng Việt
5. Nhận dạng các thẻ/tag mô tả hoạt động

OUTPUT FORMAT (JSON):
{
  "activity": {
    "phase": "khoiDong|hinhThanhKienThucMoi|luyenTap|vanDung|cuongCo",
    "name": "Tên hoạt động",
    "content": "Nội dung triển khai chi tiết",
    "grade": "Khối lớp",
    "subject": "Môn học",
    "tags": ["tag1", "tag2"],
    "time": "Thời gian (phút)",
    "materials": ["Đạo cụ", "Tài liệu"]
  },
  "confidence": 0.0-1.0,
  "notes": "Ghi chú về kết quả phân tích"
}`;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: imageFile.type,
            data: base64Image
          }
        },
        {
          text: 'Phân tích ảnh hoạt động này và trích xuất nội dung. Trả về JSON format như mô tả.'
        }
      ]
    }
  ];

  try {
    const response = await aiService.callAI({
      apiKey,
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    });

    let _cA = response.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
    const _sA = _cA.indexOf("{"), _eA = _cA.lastIndexOf("}");
    const jsonMatchA = _sA>=0 && _eA>_sA ? [_cA.slice(_sA,_eA+1)] : null;
    if (!jsonMatchA) {
      throw new Error('Không thể trích xuất JSON từ phản hồi AI');
    }
    let parsed;
    try { parsed = JSON.parse(jsonMatchA[0]); } catch { const fixed=jsonMatchA[0].replace(/,\s*([}\]])/g,"$1"); parsed=JSON.parse(fixed); }
    
    if (!parsed.activity) {
      throw new Error('Dữ liệu hoạt động không hợp lệ');
    }

    // Record successful analysis
    const resultId = `activity_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    aiDataStorage.addAnalysisHistoryEntry({
      type: 'activity',
      success: true,
      resultId,
      confidence: parsed.confidence || 0.8,
      imageSize: imageFile.size
    });
    
    aiDataStorage.storeAnalysisResult(resultId, {
      type: 'activity',
      data: parsed.activity,
      confidence: parsed.confidence || 0.8,
      notes: parsed.notes || '',
      rawResponse: response
    });

    return {
      success: true,
      data: parsed.activity,
      confidence: parsed.confidence || 0.8,
      notes: parsed.notes || '',
      rawResponse: response
    };

  } catch (error) {
    console.error('Error analyzing image for activity:', error);
    
    // Record failed analysis
    aiDataStorage.addAnalysisHistoryEntry({
      type: 'activity',
      success: false,
      error: error.message,
      imageSize: imageFile.size
    });
    
    throw error;
  }
}

/**
 * General image analysis for any educational content
 * @param {File} imageFile - Image file to analyze
 * @param {string} analysisType - Type of analysis: 'questions', 'lessonPlan', 'activity', 'general'
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeImage(imageFile, analysisType = 'general', options = {}) {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!imageFile || !imageTypes.includes(imageFile.type)) {
    throw new Error('File không hợp lệ. Chỉ chấp nhận ảnh: JPG, PNG, GIF, WebP');
  }

  // Check file size (max 10MB)
  if (imageFile.size > 10 * 1024 * 1024) {
    throw new Error('Kích thước file quá lớn. Tối đa 10MB.');
  }

  switch (analysisType) {
    case 'questions':
      return analyzeImageForQuestions(imageFile, options);
    case 'lessonPlan':
      return analyzeImageForLessonPlan(imageFile, options);
    case 'activity':
      return analyzeImageForActivity(imageFile, options);
    case 'general':
      // General analysis - detect content type automatically
      return detectAndAnalyzeImage(imageFile, options);
    default:
      throw new Error(`Loại phân tích không hỗ trợ: ${analysisType}`);
  }
}

/**
 * Automatically detect content type and analyze accordingly
 * @param {File} imageFile - Image file to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results
 */
async function detectAndAnalyzeImage(imageFile, options = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chưa có API Key! Hãy cấu hình trong Cài đặt AI.');
  }

  const base64Image = await imageToBase64(imageFile);
  
  const systemInstruction = `Bạn là chuyên gia phân tích tài liệu giáo dục. Hãy xác định loại nội dung trong ảnh và phân tích tương ứng.

LOẠI NỘI DUNG CÓ THỂ:
1. Câu hỏi (trắc nghiệm/tự luận) - chứa câu hỏi và đáp án
2. Giáo án - chứa kế hoạch bài dạy với mục tiêu, hoạt động
3. Hoạt động dạy học - chứa mô tả hoạt động cụ thể
4. Tài liệu khác - tài liệu giáo dục khác

OUTPUT FORMAT (JSON):
{
  "detectedType": "questions|lessonPlan|activity|other",
  "confidence": 0.0-1.0,
  "reasoning": "Lý do xác định loại nội dung",
  "recommendation": "Gợi ý cách xử lý tiếp"
}`;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: imageFile.type,
            data: base64Image
          }
        },
        {
          text: 'Xác định loại nội dung trong ảnh này. Trả về JSON format như mô tả.'
        }
      ]
    }
  ];

  try {
    const response = await aiService.callAI({
      apiKey,
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    });

    let _cD = response.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
    const _sD = _cD.indexOf("{"), _eD = _cD.lastIndexOf("}");
    const jsonMatchD = _sD>=0 && _eD>_sD ? [_cD.slice(_sD,_eD+1)] : null;
    if (!jsonMatchD) {
      throw new Error('Không thể trích xuất JSON từ phản hồi AI');
    }
    let parsedD;
    try { parsedD = JSON.parse(jsonMatchD[0]); } catch { const fixed=jsonMatchD[0].replace(/,\s*([}\]])/g,"$1"); parsedD=JSON.parse(fixed); }
    const parsed = parsedD;
    
    // Route to specific analysis based on detected type
    const typeMap = {
      'questions': 'questions',
      'lessonPlan': 'lessonPlan', 
      'activity': 'activity'
    };

    const specificType = typeMap[parsed.detectedType];
    if (specificType) {
      const specificAnalysis = await analyzeImage(imageFile, specificType, options);
      return {
        ...specificAnalysis,
        detectedType: parsed.detectedType,
        detectionConfidence: parsed.confidence,
        reasoning: parsed.reasoning
      };
    }

    // Return general analysis if specific type not detected
    return {
      success: true,
      detectedType: parsed.detectedType,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      recommendation: parsed.recommendation,
      data: null
    };

  } catch (error) {
    console.error('Error in auto-detection analysis:', error);
    throw error;
  }
}

/**
 * Batch analyze multiple images with progress callback
 * @param {File[]} imageFiles - Array of image files
 * @param {string} analysisType - Type of analysis
 * @param {Object} options - { onProgress: (index, result) => void }
 * @returns {Promise<Object>} Merged batch result
 */
async function analyzeImages(imageFiles, analysisType = 'general', options = {}) {
  if (!Array.isArray(imageFiles) || imageFiles.length === 0) {
    throw new Error('Không có file ảnh nào để phân tích');
  }
  const onProgress = options.onProgress || (()=>{});
  const results = [];
  for (let i = 0; i < imageFiles.length; i++) {
    try {
      const res = await analyzeImage(imageFiles[i], analysisType, options);
      results.push(res);
      onProgress(i, res);
    } catch (err) {
      const fail = { success: false, error: err.message || String(err), data: null, confidence: 0 };
      results.push(fail);
      onProgress(i, fail);
    }
  }
  return mergeBatchResults(results, analysisType, imageFiles);
}

/**
 * Merge batch results according to analysis type
 * @param {Object[]} results - Array of single-image results
 * @param {string} analysisType - Type
 * @param {File[]} files - Original files for reference
 * @returns {Object} Merged result
 */
function mergeBatchResults(results, analysisType, files = []) {
  const successes = results.filter(r => r.success);
  const total = results.length;
  const successCount = successes.length;

  if (successCount === 0) {
    return {
      success: false,
      error: `Tất cả ${total} ảnh đều phân tích thất bại: ${results.map(r=>r.error).filter(Boolean).join('; ')}`,
      data: null,
      confidence: 0,
      results,
      isBatch: true
    };
  }

  if (analysisType === 'questions') {
    const allQuestions = successes.flatMap(r => Array.isArray(r.data) ? r.data : (r.data?.questions || []));
    const avgConfidence = successes.reduce((s,r)=> s + (r.confidence||0), 0) / successes.length;
    return {
      success: allQuestions.length > 0,
      data: allQuestions,
      confidence: avgConfidence || 0.8,
      notes: `Đã gộp ${allQuestions.length} câu hỏi từ ${successCount}/${total} ảnh thành công`,
      results,
      isBatch: true,
      totalQuestions: allQuestions.length
    };
  }

  if (analysisType === 'lessonPlan') {
    // Merge lesson plans: take first as base, append activities/objectives from rest
    const basePlan = JSON.parse(JSON.stringify(successes[0].data || {}));
    basePlan.activities = basePlan.activities || [];
    basePlan.objectives = basePlan.objectives || [];
    basePlan.assessment = basePlan.assessment || [];
    for (let i = 1; i < successes.length; i++) {
      const cur = successes[i].data || {};
      if (Array.isArray(cur.activities) && cur.activities.length) {
        basePlan.activities = [...(basePlan.activities||[]), ...cur.activities];
      }
      if (Array.isArray(cur.objectives) && cur.objectives.length) {
        basePlan.objectives = [...(basePlan.objectives||[]), ...cur.objectives];
      }
      // Merge preparation if exists
      if (cur.preparation) {
        basePlan.preparation = basePlan.preparation || { teacher: [], student: [] };
        if (Array.isArray(cur.preparation.teacher)) basePlan.preparation.teacher.push(...cur.preparation.teacher);
        if (Array.isArray(cur.preparation.student)) basePlan.preparation.student.push(...cur.preparation.student);
      }
    }
    // Deduplicate objectives if needed
    if (Array.isArray(basePlan.objectives)) {
      const seen = new Set();
      basePlan.objectives = basePlan.objectives.filter(o => {
        const key = typeof o === 'string' ? o : JSON.stringify(o);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    const avgConfidence = successes.reduce((s,r)=> s + (r.confidence||0), 0) / successes.length;
    return {
      success: true,
      data: basePlan,
      confidence: avgConfidence || 0.8,
      notes: `Đã gộp ${basePlan.activities?.length||0} hoạt động từ ${successCount}/${total} ảnh thành 1 giáo án`,
      results,
      isBatch: true
    };
  }

  if (analysisType === 'activity') {
    const allActivities = successes.map(r => r.data).filter(Boolean);
    const avgConfidence = successes.reduce((s,r)=> s + (r.confidence||0), 0) / successes.length;
    return {
      success: allActivities.length > 0,
      data: allActivities.length === 1 ? allActivities[0] : allActivities,
      confidence: avgConfidence || 0.8,
      notes: `${allActivities.length} hoạt động từ ${successCount}/${total} ảnh`,
      results,
      isBatch: allActivities.length > 1
    };
  }

  // general / other: keep array of datas
  const avgConfidence = successes.reduce((s,r)=> s + (r.confidence||0), 0) / successes.length;
  return {
    success: true,
    data: successes.length === 1 ? successes[0].data : successes.map(r=>r.data),
    confidence: avgConfidence || 0.8,
    notes: `Hoàn tất ${successCount}/${total} ảnh`,
    results,
    isBatch: successes.length > 1
  };
}

export default {
  analyzeImage,
  analyzeImages,
  mergeBatchResults,
  analyzeImageForQuestions,
  analyzeImageForLessonPlan,
  analyzeImageForActivity,
  imageToBase64
};