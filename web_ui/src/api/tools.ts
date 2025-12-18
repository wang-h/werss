import http from './http'

export const exportArticles = (params:any) => {
    // 确保 format 是数组
    const formatArray = Array.isArray(params.format) ? params.format : []
    
    const requestData = {
      mp_id: params.mp_id || '',
      doc_id: params.scope === 'selected' ? (params.ids || []) : [],
      page_size: params.page_size || 10,
      page_count: params.page_count || 1,
      add_title: params.add_title !== undefined ? params.add_title : true,
      remove_images: params.remove_images || false,
      remove_links: params.remove_links || false,
      export_md: formatArray.includes('md'),
      export_docx: formatArray.includes('docx'),
      export_json: formatArray.includes('json'),
      export_csv: formatArray.includes('csv'),
      export_pdf: formatArray.includes('pdf'),
      zip_filename: params.zip_filename || ''
    };
    
    // 验证至少选择一个导出格式
    if (!requestData.export_md && !requestData.export_docx && !requestData.export_json && 
        !requestData.export_csv && !requestData.export_pdf) {
      throw new Error('请至少选择一个导出格式')
    }
    
  return http.post<{code: number, data: any, message?: string}>('/wx/tools/export/articles', requestData, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  })
}
export const getExportRecords = (params:any) => {
    const requestData = {
      mp_id: params.mp_id,
    };
  return http.get<{code: number, data: string}>('/wx/tools/export/list', {params:requestData})
}
export const DeleteExportRecords = (params:any) => {
    const requestData = {
      mp_id: params.mp_id||"",
      filename: params.filename,
    };
  return http.delete<{code: number, data: string}>('/wx/tools/export/delete', {data:requestData})
}