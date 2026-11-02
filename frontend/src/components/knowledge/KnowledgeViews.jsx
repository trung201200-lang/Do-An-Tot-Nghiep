import React from 'react';
import { Alert, Badge, Button, EmptyState } from '../ui';
import Icon from '../ui/Icon';

const statusNames = { DRAFT: 'Bản nháp', PUBLISHED: 'Đã xuất bản', ARCHIVED: 'Đã lưu trữ' };
export const transitions = {
  DRAFT: { status: 'PUBLISHED', label: 'Xuất bản', description: 'Bài viết sẽ hiển thị cho nhân viên trong Kho kiến thức. Hãy kiểm tra nội dung trước khi xuất bản.' },
  PUBLISHED: { status: 'ARCHIVED', label: 'Lưu trữ', description: 'Bài viết sẽ không còn hiển thị cho nhân viên. IT và quản trị viên vẫn có thể xem và quản lý bài viết.' },
  ARCHIVED: { status: 'DRAFT', label: 'Chuyển về bản nháp', description: 'Bài viết sẽ trở về bản nháp để tiếp tục biên soạn. Nhân viên chỉ xem được bài sau khi bạn xuất bản lại.' },
};
const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('vi-VN') : 'Chưa có thông tin';
const Status = ({ value }) => <Badge tone={`kb-${value}`}>{statusNames[value] || value}</Badge>;
export function validateArticle(body) {
  const errors = {};
  if (!body.title) errors.title = 'Vui lòng nhập tiêu đề bài viết.';
  else if ([...body.title].length > 255) errors.title = 'Tiêu đề tối đa 255 ký tự Unicode.';
  if (!body.content) errors.content = 'Vui lòng nhập nội dung bài viết.';
  else if (new TextEncoder().encode(JSON.stringify(body)).length > 16 * 1024) errors.content = 'Bài viết quá dài. Hãy rút gọn nội dung trước khi lưu (giới hạn dữ liệu gửi 16 KB).';
  return errors;
}

export function KnowledgeList({ articles, canManage, query, onQuery, status, onStatus, busy, onOpen }) {
  // Backend enforces the same visibility; this also avoids rendering a stale non-published row for employees.
  const available = articles.filter(article => canManage || article.status === 'PUBLISHED');
  const keyword = query.trim().toLocaleLowerCase('vi-VN');
  const visible = available.filter(article => `${article.code} ${article.title}`.toLocaleLowerCase('vi-VN').includes(keyword) && (!canManage || !status || article.status === status));
  const filtered = Boolean(query || (canManage && status));
  const clear = () => { onQuery(''); onStatus(''); };
  return <>
    <div className="knowledge-filters" role="search" aria-label="Tìm và lọc bài viết">
      <div className="knowledge-search"><label htmlFor="kb-search">Tìm theo mã hoặc tiêu đề</label><input id="kb-search" type="search" placeholder="Nhập mã KB hoặc tiêu đề bài viết…" value={query} onChange={event => onQuery(event.target.value)} aria-describedby="kb-search-hint" /><p id="kb-search-hint">Tìm kiếm trong danh sách bài viết bạn được phép xem.</p></div>
      {canManage && <div><label htmlFor="kb-status-filter">Trạng thái bài viết</label><select id="kb-status-filter" value={status} onChange={event => onStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      {filtered && <Button variant="secondary" onClick={clear}>Xóa bộ lọc</Button>}
    </div>
    <p className="knowledge-count" role="status" aria-live="polite">Hiển thị <strong>{visible.length}</strong> / {available.length} bài viết{!canManage && ' đã xuất bản'}</p>
    {!available.length ? <EmptyState icon="book" title="Chưa có bài viết" description={canManage ? 'Chọn “Tạo bài viết” để bổ sung hướng dẫn vào Kho kiến thức.' : 'Các hướng dẫn sẽ xuất hiện tại đây sau khi được xuất bản.'} /> : !visible.length ?
      <EmptyState icon="book" title="Không tìm thấy bài viết phù hợp" description="Thử tìm theo mã, tiêu đề khác hoặc xóa bộ lọc."><Button variant="secondary" onClick={clear}>Xóa bộ lọc</Button></EmptyState> :
      <ul className="kb-list" aria-label="Danh sách bài viết">{visible.map(article => <li key={article.id} className="knowledge-card">
        <span className="knowledge-card__icon"><Icon name="book" size={24} /></span><div className="knowledge-card__body">
          <div className="knowledge-card__top"><span className="knowledge-code">{article.code}</span><Status value={article.status} /></div>
          <h3><Button variant="secondary" className="kb-title" data-open-article={article.id} aria-label={`Đọc ${article.code}: ${article.title}`} disabled={busy} onClick={() => onOpen(article.id)}>{article.title}</Button></h3>
          <div className="kb-meta"><span>Cập nhật: {date(article.updated_at)}</span>{canManage && <><span>Người tạo: {article.creator_name}</span><span>Người cập nhật: {article.updater_name || 'Chưa có'}</span></>}</div>
        </div>
      </li>)}</ul>}
  </>;
}

export function KnowledgeDetail({ article, canManage, busy, onEdit, onStatus }) {
  return <article className="kb-detail" aria-label="Chi tiết bài viết">
    <header className="knowledge-article-heading"><div className="knowledge-card__top"><span className="knowledge-code">{article.code}</span><Status value={article.status} /></div><h3>{article.title}</h3><p>Cập nhật lần cuối: {date(article.updated_at)}</p></header>
    <div className="knowledge-reading-layout"><section className="knowledge-reading" aria-label="Nội dung hướng dẫn"><h4>Nội dung hướng dẫn</h4>
      {/* Preserve the exact source text, line breaks and escaping. Never render HTML from KB. */}
      <div className="kb-content">{article.content}</div>
    </section><aside className="knowledge-sidebar">
      <section className="knowledge-panel"><h4>Thông tin bài viết</h4><dl className="kb-meta-details"><dt>Người tạo</dt><dd>{article.creator_name || 'Chưa có thông tin'}</dd><dt>Ngày tạo</dt><dd>{date(article.created_at)}</dd><dt>Người cập nhật</dt><dd>{article.updater_name || 'Chưa có'}</dd><dt>Ngày cập nhật</dt><dd>{date(article.updated_at)}</dd></dl></section>
      {canManage && <section className="knowledge-panel knowledge-management"><h4>Quản lý bài viết</h4><p>{article.status === 'PUBLISHED' ? 'Bài viết đang hiển thị cho nhân viên.' : article.status === 'DRAFT' ? 'Bản nháp chỉ hiển thị cho IT và quản trị viên.' : 'Bài lưu trữ không hiển thị cho nhân viên.'}</p><div className="actions"><Button variant="secondary" disabled={busy} onClick={onEdit}>Sửa bài</Button>{transitions[article.status] && <Button disabled={busy} onClick={onStatus}>{transitions[article.status].label}</Button>}</div></section>}
    </aside></div>
  </article>;
}

export function KnowledgeForm({ editing, status, title, content, errors, busy, onTitle, onContent, onSubmit, onCancel }) {
  return <div className="knowledge-compose-layout"><form className="kb-form" noValidate onSubmit={onSubmit}>
    <div className="knowledge-form-heading"><h3>{editing ? 'Nội dung bài viết' : 'Biên soạn hướng dẫn mới'}</h3><p>Các trường có dấu * là bắt buộc.</p></div>
    {editing && status === 'PUBLISHED' && <Alert tone="info">Bạn đang sửa bài đã xuất bản. Thay đổi sẽ hiển thị cho nhân viên sau khi lưu.</Alert>}
    <label htmlFor="kb-title">Tiêu đề <span aria-hidden="true">*</span></label><input id="kb-title" required value={title} disabled={busy} aria-invalid={Boolean(errors.title)} aria-describedby="kb-title-limit kb-title-error" placeholder="Ví dụ: Hướng dẫn khắc phục lỗi kết nối Wi-Fi" onChange={event => onTitle(event.target.value)} />
    <p id="kb-title-limit" className="knowledge-field-hint">{[...title.trim()].length}/255 ký tự Unicode</p>
    {errors.title && <p id="kb-title-error" className="knowledge-field-error" role="alert">{errors.title}</p>}
    <label htmlFor="kb-content">Nội dung <span aria-hidden="true">*</span></label><textarea id="kb-content" required rows={14} value={content} disabled={busy} aria-invalid={Boolean(errors.content)} aria-describedby="kb-content-hint kb-content-error" placeholder="Mô tả vấn đề, điều kiện áp dụng và từng bước xử lý…" onChange={event => onContent(event.target.value)} />
    <p id="kb-content-hint" className="knowledge-field-hint">Nội dung văn bản; giữ nguyên xuống dòng khi hiển thị. Giới hạn dữ liệu gửi của bài viết: 16 KB.</p>
    {errors.content && <p id="kb-content-error" className="knowledge-field-error" role="alert">{errors.content}</p>}
    <div className="actions knowledge-form-footer"><Button type="submit" disabled={busy}>Lưu bài viết</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Hủy</Button></div>
  </form><aside className="knowledge-compose-help"><Icon name="book" size={28} /><h3>Một hướng dẫn dễ áp dụng</h3><ol><li>Đặt tiêu đề mô tả rõ vấn đề.</li><li>Nêu điều kiện áp dụng.</li><li>Chia hướng dẫn thành từng bước và xuống dòng rõ ràng.</li><li>Ghi cách kiểm tra kết quả sau xử lý.</li></ol><p>{editing ? 'Lưu nội dung không làm thay đổi trạng thái hiện tại của bài viết.' : 'Bài viết mới được lưu ở trạng thái Bản nháp. Bạn có thể kiểm tra lại trước khi xuất bản.'}</p></aside></div>;
}
