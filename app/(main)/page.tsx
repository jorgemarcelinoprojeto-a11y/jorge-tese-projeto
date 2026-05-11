'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewProjectDialog } from '@/components/new-project-dialog';
import { NewThesisDialog } from '@/components/thesis/new-thesis-dialog';
import { FolderPlus, Folder, FileText, Sparkles, BookOpen, GraduationCap, Search } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

type Project = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
};

type Thesis = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  chapterCount: number;
  chapterTitles?: string[];
};

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'projects' | 'theses'>('theses');
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newThesisDialogOpen, setNewThesisDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const searchNorm = searchQuery.trim().toLowerCase();
  const hasActiveSearch = searchNorm.length > 0;

  const filteredTheses = useMemo(() => {
    if (!hasActiveSearch) return theses;
    return theses.filter((t) => {
      const inTitle = t.title.toLowerCase().includes(searchNorm);
      const inDesc = (t.description || '').toLowerCase().includes(searchNorm);
      const inChapters = (t.chapterTitles || []).some((ct) =>
        ct.toLowerCase().includes(searchNorm)
      );
      return inTitle || inDesc || inChapters;
    });
  }, [theses, searchNorm, hasActiveSearch]);

  const filteredProjects = useMemo(() => {
    if (!hasActiveSearch) return projects;
    return projects.filter((p) => {
      const inName = p.name.toLowerCase().includes(searchNorm);
      const inDesc = (p.description || '').toLowerCase().includes(searchNorm);
      return inName || inDesc;
    });
  }, [projects, searchNorm, hasActiveSearch]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Falha ao carregar projetos');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar projetos');
    }
  };

  const loadTheses = async () => {
    try {
      const res = await fetch('/api/theses');
      if (!res.ok) throw new Error('Falha ao carregar teses');
      const data = await res.json();
      setTheses(data.theses || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar teses');
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadProjects(), loadTheses()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div className="min-h-[calc(100vh-200px)] relative">
      {/* Subtle background lights - static */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-20 w-[500px] h-[500px] bg-red-500/3 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-20 left-20 w-[400px] h-[400px] bg-red-600/2 rounded-full blur-[100px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-red-500/2 rounded-full blur-[120px]"></div>
      </div>

      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-gray-400 text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-red-500" />
              Organize suas teses, livros e documentos com inteligência artificial
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setNewProjectDialogOpen(true)}
              variant="outline"
              className="h-11 px-6"
            >
              <FolderPlus className="mr-2 h-5 w-5" />
              Nova Tese completa
            </Button>
            <Button
              onClick={() => setNewThesisDialogOpen(true)}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/20 transition-all transform hover:scale-105 active:scale-95 h-11 px-6"
            >
              <BookOpen className="mr-2 h-5 w-5" />
              Nova Tese
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-red-600/40 rounded-full animate-spin animation-delay-150"></div>
            </div>
            <p className="text-gray-400 mt-6 text-sm">Carregando...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'projects' | 'theses')} className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2 bg-white/5 p-1">
              <TabsTrigger value="theses" className="data-[state=active]:bg-red-600">
                <BookOpen className="h-4 w-4 mr-2" />
                Teses com capítulos ({theses.length})
              </TabsTrigger>
              <TabsTrigger value="projects" className="data-[state=active]:bg-red-600">
                <Folder className="h-4 w-4 mr-2" />
                Teses completas ({projects.length})
              </TabsTrigger>
            </TabsList>

            <div className="relative max-w-lg">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none"
                aria-hidden
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar"
                aria-label="Pesquisar na dashboard"
                className="h-10 pl-9 border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:ring-red-500/40"
              />
            </div>

            {/* Theses Tab */}
            <TabsContent value="theses" className="space-y-4">
              {theses.length === 0 ? (
                <Card className="relative bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-white/10 shadow-2xl">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-8">
                    <div className="relative mb-8">
                      <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full"></div>
                      <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-white/10">
                        <GraduationCap className="h-16 w-16 text-red-500" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                      Nenhuma tese criada
                    </h3>
                    <p className="text-gray-400 mb-8 text-center max-w-md">
                      Crie sua primeira tese para organizar capítulos versionados com IA
                    </p>
                    <Button
                      onClick={() => setNewThesisDialogOpen(true)}
                      className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/30 transition-all transform hover:scale-105 active:scale-95 h-12 px-8"
                    >
                      <BookOpen className="mr-2 h-5 w-5" />
                      Criar Primeira Tese
                    </Button>
                  </CardContent>
                </Card>
              ) : filteredTheses.length === 0 ? (
                <Card className="relative bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-white/10">
                  <CardContent className="flex flex-col items-center justify-center py-12 px-8 text-center">
                    <p className="text-gray-300 mb-2">
                      Nenhum resultado para «{searchQuery.trim()}»
                    </p>
                    <p className="text-gray-500 text-sm mb-6">
                      Tente outro termo ou limpe a pesquisa.
                    </p>
                    <Button variant="outline" className="border-white/20" onClick={() => setSearchQuery('')}>
                      Limpar pesquisa
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {hasActiveSearch && (
                    <p className="text-sm text-gray-400">
                      {filteredTheses.length}{' '}
                      {filteredTheses.length === 1 ? 'resultado' : 'resultados'}
                    </p>
                  )}
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredTheses.map((thesis, index) => (
                    <Link
                      key={thesis.id}
                      href={`/theses/${thesis.id}`}
                      className="group"
                      style={{
                        animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`
                      }}
                    >
                      <div className="relative h-full">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-red-800 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-all duration-300"></div>
                        <Card className="relative h-full bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10 hover:border-red-500/30 transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-red-500/10 group-hover:-translate-y-1 cursor-pointer overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 via-red-500/0 to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          <CardHeader className="relative">
                            <div className="flex items-start justify-between mb-4">
                              <div className="relative">
                                <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="relative p-3 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl border border-red-500/20 group-hover:border-red-500/40 transition-colors">
                                  <GraduationCap className="h-7 w-7 text-red-500" />
                                </div>
                              </div>
                              <Badge
                                variant="secondary"
                                className="bg-white/10 text-gray-300 border-white/10 backdrop-blur-sm px-3 py-1"
                              >
                                <FileText className="h-3 w-3 mr-1.5" />
                                {thesis.chapterCount} {thesis.chapterCount === 1 ? 'cap' : 'caps'}
                              </Badge>
                            </div>
                            <CardTitle className="line-clamp-1 text-xl font-bold text-white group-hover:text-red-400 transition-colors">
                              {thesis.title}
                            </CardTitle>
                            <CardDescription className="line-clamp-2 text-gray-400 text-sm leading-relaxed">
                              {thesis.description || 'Sem descrição'}
                            </CardDescription>
                          </CardHeader>
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </Card>
                      </div>
                    </Link>
                  ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Projects Tab */}
            <TabsContent value="projects" className="space-y-4">
              {projects.length === 0 ? (
                <Card className="relative bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-white/10 shadow-2xl">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-8">
                    <div className="relative mb-8">
                      <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full"></div>
                      <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-white/10">
                        <Folder className="h-16 w-16 text-red-500" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                      Nenhum projeto criado
                    </h3>
                    <p className="text-gray-400 mb-8 text-center max-w-md">
                      Comece criando seu primeiro projeto para organizar e gerenciar seus documentos com o poder da IA
                    </p>
                    <Button
                      onClick={() => setNewProjectDialogOpen(true)}
                      className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/30 transition-all transform hover:scale-105 active:scale-95 h-12 px-8"
                    >
                      <FolderPlus className="mr-2 h-5 w-5" />
                      Criar Primeiro Projeto
                    </Button>
                  </CardContent>
                </Card>
              ) : filteredProjects.length === 0 ? (
                <Card className="relative bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-white/10">
                  <CardContent className="flex flex-col items-center justify-center py-12 px-8 text-center">
                    <p className="text-gray-300 mb-2">
                      Nenhum resultado para «{searchQuery.trim()}»
                    </p>
                    <p className="text-gray-500 text-sm mb-6">
                      Tente outro termo ou limpe a pesquisa.
                    </p>
                    <Button variant="outline" className="border-white/20" onClick={() => setSearchQuery('')}>
                      Limpar pesquisa
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {hasActiveSearch && (
                    <p className="text-sm text-gray-400">
                      {filteredProjects.length}{' '}
                      {filteredProjects.length === 1 ? 'resultado' : 'resultados'}
                    </p>
                  )}
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredProjects.map((project, index) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="group"
                      style={{
                        animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`
                      }}
                    >
                      <div className="relative h-full">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-red-800 rounded-2xl opacity-0 group-hover:opacity-20 blur transition-all duration-300"></div>
                        <Card className="relative h-full bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10 hover:border-red-500/30 transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-red-500/10 group-hover:-translate-y-1 cursor-pointer overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 via-red-500/0 to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          <CardHeader className="relative">
                            <div className="flex items-start justify-between mb-4">
                              <div className="relative">
                                <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="relative p-3 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl border border-red-500/20 group-hover:border-red-500/40 transition-colors">
                                  <Folder className="h-7 w-7 text-red-500" />
                                </div>
                              </div>
                              <Badge
                                variant="secondary"
                                className="bg-white/10 text-gray-300 border-white/10 backdrop-blur-sm px-3 py-1"
                              >
                                <FileText className="h-3 w-3 mr-1.5" />
                                {project.documentCount} {project.documentCount === 1 ? 'doc' : 'docs'}
                              </Badge>
                            </div>
                            <CardTitle className="line-clamp-1 text-xl font-bold text-white group-hover:text-red-400 transition-colors">
                              {project.name}
                            </CardTitle>
                            <CardDescription className="line-clamp-2 text-gray-400 text-sm leading-relaxed">
                              {project.description || 'Sem descrição'}
                            </CardDescription>
                          </CardHeader>
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </Card>
                      </div>
                    </Link>
                  ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <NewProjectDialog
          open={newProjectDialogOpen}
          onOpenChange={setNewProjectDialogOpen}
          onProjectCreated={loadProjects}
        />

        <NewThesisDialog
          open={newThesisDialogOpen}
          onOpenChange={setNewThesisDialogOpen}
          onThesisCreated={loadTheses}
        />
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animation-delay-150 {
          animation-delay: 150ms;
        }
      `}</style>
    </div>
  );
}
