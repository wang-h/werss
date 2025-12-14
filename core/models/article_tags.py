"""文章-标签关联表模型"""
from .base import Base, Column, String, DateTime, ForeignKey, UniqueConstraint
from datetime import datetime


class ArticleTag(Base):
    """文章-标签关联表"""
    __tablename__ = 'article_tags'
    
    id = Column(String(255), primary_key=True)
    article_id = Column(String(255), ForeignKey('articles.id', ondelete='CASCADE'), nullable=False, index=True)
    tag_id = Column(String(255), ForeignKey('tags.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)
    
    # 唯一约束：同一篇文章不能重复添加同一标签
    __table_args__ = (
        UniqueConstraint('article_id', 'tag_id', name='uq_article_tag'),
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<ArticleTag(article_id={self.article_id}, tag_id={self.tag_id})>"

