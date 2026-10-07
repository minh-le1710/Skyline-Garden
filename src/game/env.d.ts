// src/game chạy cả trên trình duyệt lẫn server (Node) nên không dùng lib DOM.
// structuredClone có ở cả hai môi trường; khai báo ở đây để tsconfig.game.json (không DOM, không Node) biên dịch được.
declare function structuredClone<T>(value: T): T;
