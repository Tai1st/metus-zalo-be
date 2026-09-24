export enum Role {
  User = 'user',
  /** Nhân sự — quyền hạn chế do metus-zalo's "Quản lý truy cập" cấp (chỉ
   * dùng mục Chat, chỉ với các tài khoản Zalo được gán). Tách riêng khỏi
   * `User` để không lẫn với người dùng của các tính năng khác (gói cước…). */
  Staff = 'staff',
  Admin = 'admin',
}
