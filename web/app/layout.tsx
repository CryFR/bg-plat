export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru">
            <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0b0b10", color: "#eee" }}>
                {children}
            </body>
        </html>
    );
}